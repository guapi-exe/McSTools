//! Read-only bridge to the developer API. Credentials never enter a URL,
//! persisted settings, or an HTTP redirect to another origin.
use crate::modules::schematic::encode_uploaded_schematic;
use base64::Engine;
use reqwest::{Client, Response, Url, header};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, State};

const API_ORIGIN: &str = "https://www.mcschematic.top";
const MAX_JSON_BYTES: usize = 8 * 1024 * 1024;
// Match the parser before downloading; a compressed file can expand to 1 GiB.
const MAX_SOURCE_BYTES: usize = crate::utils::parse_limits::MAX_INPUT_BYTES;
const MAX_PREVIEW_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McsApiError {
    pub code: String,
    pub message: String,
    pub retry_after_seconds: Option<u64>,
}

impl McsApiError {
    fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            retry_after_seconds: None,
        }
    }
}

pub struct McsApiState {
    client: Client,
    // Deliberately not Debug/Serialize: the key is process-memory only.
    key: Mutex<Option<String>>,
    retry_at: Mutex<Option<Instant>>,
    requests: tokio::sync::Semaphore,
    imports: tokio::sync::Semaphore,
}

// Keep the concurrency slot until the bounded body is consumed (or cancelled),
// not merely until the server sends its response headers.
struct LimitedResponse<'a> {
    response: Response,
    _permit: tokio::sync::SemaphorePermit<'a>,
}

impl std::ops::Deref for LimitedResponse<'_> {
    type Target = Response;
    fn deref(&self) -> &Response {
        &self.response
    }
}
impl std::ops::DerefMut for LimitedResponse<'_> {
    fn deref_mut(&mut self) -> &mut Response {
        &mut self.response
    }
}

impl McsApiState {
    pub fn new() -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(15))
                .timeout(Duration::from_secs(180))
                .user_agent(concat!("McSTools/", env!("CARGO_PKG_VERSION")))
                .build()?,
            key: Mutex::new(None),
            retry_at: Mutex::new(None),
            requests: tokio::sync::Semaphore::new(4),
            imports: tokio::sync::Semaphore::new(1),
        })
    }

    async fn get(
        &self,
        path: &str,
        query: &BTreeMap<String, String>,
        authenticated: bool,
    ) -> Result<LimitedResponse<'_>, McsApiError> {
        self.get_with(path, query, authenticated, |request| {
            self.client.execute(request)
        })
        .await
    }

    // Keep URL validation, credential stripping, status handling and permits
    // in one path. Tests can route the already-built requests to loopback
    // without adding test domains or insecure TLS exceptions to the policy.
    async fn get_with<F, Fut>(
        &self,
        path: &str,
        query: &BTreeMap<String, String>,
        authenticated: bool,
        mut send: F,
    ) -> Result<LimitedResponse<'_>, McsApiError>
    where
        F: FnMut(reqwest::Request) -> Fut,
        Fut: std::future::Future<Output = Result<Response, reqwest::Error>>,
    {
        validate_path(path)?;
        validate_query(query)?;
        let _permit = self
            .requests
            .acquire()
            .await
            .map_err(|_| McsApiError::new("CLOSED", "网络服务已关闭"))?;
        if let Some(until) = *self.retry_at.lock().map_err(|_| internal_error())? {
            if until > Instant::now() {
                let seconds = until.saturating_duration_since(Instant::now()).as_secs() + 1;
                return Err(McsApiError {
                    code: "RATE_LIMITED".into(),
                    message: "请求过于频繁，请稍后重试".into(),
                    retry_after_seconds: Some(seconds),
                });
            }
        }
        let mut key = if authenticated {
            Some(
                self.key
                    .lock()
                    .map_err(|_| internal_error())?
                    .clone()
                    .ok_or_else(|| McsApiError::new("AUTH_REQUIRED", "请先连接只读 API Key"))?,
            )
        } else {
            None
        };
        let mut url = Url::parse(&format!("{API_ORIGIN}{path}")).map_err(|_| internal_error())?;
        url.query_pairs_mut().extend_pairs(query);
        for _ in 0..5 {
            let mut request = self.client.get(url.clone());
            // A signed object URL can use another MCS subdomain, but must not
            // receive credentials, even if it redirects back to the API later.
            if sends_credentials(&url) {
                if let Some(ref token) = key {
                    request = request.bearer_auth(token);
                }
            }
            let request = request
                .build()
                .map_err(|_| McsApiError::new("NETWORK", "无法创建蓝图站请求"))?;
            let response = send(request)
                .await
                .map_err(|_| McsApiError::new("NETWORK", "无法连接蓝图站，请检查网络后重试"))?;
            if response.status().is_redirection() {
                let location = response
                    .headers()
                    .get(header::LOCATION)
                    .and_then(|v| v.to_str().ok())
                    .ok_or_else(|| McsApiError::new("REDIRECT", "下载地址缺少重定向目标"))?;
                url = url
                    .join(location)
                    .map_err(|_| McsApiError::new("REDIRECT", "下载重定向地址无效"))?;
                if !allowed_redirect(&url) {
                    return Err(McsApiError::new(
                        "UNTRUSTED_REDIRECT",
                        "文件跳转到了未授权域名，请在网站下载后导入",
                    ));
                }
                if !sends_credentials(&url) {
                    key = None;
                }
                continue;
            }
            let status = response.status().as_u16();
            if status == 429 {
                let seconds = response
                    .headers()
                    .get(header::RETRY_AFTER)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(60)
                    .clamp(1, 3600);
                *self.retry_at.lock().map_err(|_| internal_error())? =
                    Some(Instant::now() + Duration::from_secs(seconds));
                return Err(McsApiError {
                    code: "RATE_LIMITED".into(),
                    message: "请求过于频繁，请稍后重试".into(),
                    retry_after_seconds: Some(seconds),
                });
            }
            if !response.status().is_success() {
                let (code, message) = match status {
                    400 => ("BAD_REQUEST", "筛选或分页参数无效，请刷新列表"),
                    401 => ("AUTH_REQUIRED", "API Key 无效、已过期或已撤销，请重新连接"),
                    403 => (
                        "FORBIDDEN",
                        "API Key 权限不足或无权访问，请检查 public:read / account:read 范围",
                    ),
                    404 | 410 => ("NOT_FOUND", "该蓝图或版本不存在，或目前不可访问"),
                    _ => ("SERVER", "蓝图站暂时无法处理请求，请稍后重试"),
                };
                return Err(McsApiError::new(code, message));
            }
            return Ok(LimitedResponse { response, _permit });
        }
        Err(McsApiError::new("REDIRECT", "文件重定向次数过多"))
    }

    async fn json(
        &self,
        path: &str,
        query: &BTreeMap<String, String>,
        authenticated: bool,
    ) -> Result<Value, McsApiError> {
        let response = self.get(path, query, authenticated).await?;
        let bytes = read_bounded(response, MAX_JSON_BYTES).await?;
        serde_json::from_slice(&bytes)
            .map_err(|_| McsApiError::new("INVALID_RESPONSE", "蓝图站返回了无法识别的数据"))
    }
}

fn internal_error() -> McsApiError {
    McsApiError::new("INTERNAL", "网络服务状态异常，请重启软件")
}

fn valid_uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, byte)| {
            if [8, 13, 18, 23].contains(&i) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}

fn validate_path(path: &str) -> Result<(), McsApiError> {
    if matches!(
        path,
        "/api/v1/blueprints"
            | "/api/v1/categories"
            | "/api/v1/blueprints/mod-facets"
            | "/api/v1/account/blueprints"
            | "/api/v1/account/favourites"
    ) {
        return Ok(());
    }
    let parts: Vec<_> = path.split('/').collect();
    let valid = parts.len() >= 5
        && parts[..4] == ["", "api", "v1", "blueprints"]
        && valid_uuid(parts[4])
        && (parts.len() == 5
            || (parts.get(5) == Some(&"versions")
                && (parts.len() == 6
                    || (parts
                        .get(6)
                        .is_some_and(|s| s.parse::<u32>().is_ok_and(|n| n > 0))
                        && (parts.len() == 7
                            || (parts.len() == 8
                                && matches!(parts[7], "download" | "preview")))))));
    if valid {
        Ok(())
    } else {
        Err(McsApiError::new("INVALID_PATH", "不支持的 API 读取路径"))
    }
}

fn validate_query(query: &BTreeMap<String, String>) -> Result<(), McsApiError> {
    let valid = query.len() <= 12
        && query.iter().all(|(key, value)| {
            matches!(
                key.as_str(),
                "cursor"
                    | "page"
                    | "limit"
                    | "sort"
                    | "extra"
                    | "featured"
                    | "category"
                    | "format"
                    | "gameVersion"
                    | "mod"
                    | "creator"
                    | "q"
                    | "filter"
            ) && value.len() <= 4096
                && !value.chars().any(char::is_control)
        })
        && !(query.contains_key("cursor") && query.contains_key("page"));
    if valid {
        Ok(())
    } else {
        Err(McsApiError::new("INVALID_QUERY", "不支持的 API 查询参数"))
    }
}

fn sends_credentials(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("www.mcschematic.top")
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && url.path().starts_with("/api/v1/")
}

fn allowed_redirect(url: &Url) -> bool {
    url.scheme() == "https"
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && url
            .host_str()
            .is_some_and(|h| h == "mcschematic.top" || h.ends_with(".mcschematic.top"))
}

async fn read_bounded(
    mut response: LimitedResponse<'_>,
    limit: usize,
) -> Result<Vec<u8>, McsApiError> {
    if response
        .content_length()
        .is_some_and(|size| size > limit as u64)
    {
        return Err(McsApiError::new("TOO_LARGE", "文件超过当前安全读取上限"));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| McsApiError::new("NETWORK", "下载中断，请重试"))?
    {
        if chunk.len() > limit.saturating_sub(bytes.len()) {
            return Err(McsApiError::new("TOO_LARGE", "文件超过当前安全读取上限"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn source_filename(name: &str, format: &str) -> Result<String, McsApiError> {
    let extension = match format {
        "create" => "nbt",
        "litematica" => "litematic",
        "building_gadgets" => "json",
        "world_edit" => "schem",
        "bedrock_edition" => "mcstructure",
        "mcedit" => "schematic",
        _ => return Err(McsApiError::new("FORMAT", "软件尚不支持该蓝图格式")),
    };
    let safe: String = name
        .chars()
        .filter(|c| !c.is_control() && !"<>:\"/\\|?*".contains(*c))
        .take(180)
        .collect();
    let safe = safe.trim().trim_matches('.');
    let stem = if safe.is_empty() {
        "blueprint"
    } else {
        safe.rsplit_once('.').map_or(safe, |(stem, _)| stem)
    };
    Ok(format!("{stem}.{extension}"))
}

#[tauri::command]
pub fn set_mcs_api_key(api: State<'_, McsApiState>, key: String) -> Result<(), McsApiError> {
    let key = key.trim();
    if !key.is_empty()
        && (!key.starts_with("mcs_live_")
            || key.len() > 512
            || !key
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-'))
    {
        return Err(McsApiError::new(
            "INVALID_KEY",
            "请输入网站签发的 mcs_live_ 开头的只读 API Key",
        ));
    }
    *api.key.lock().map_err(|_| internal_error())? = if key.is_empty() {
        None
    } else {
        Some(key.into())
    };
    Ok(())
}

#[tauri::command]
pub async fn mcs_api_get(
    api: State<'_, McsApiState>,
    path: String,
    query: BTreeMap<String, String>,
    authenticated: bool,
) -> Result<Value, McsApiError> {
    // Source bytes are never sent through JSON IPC by this command.
    if path.ends_with("/download") || path.ends_with("/preview") {
        return Err(McsApiError::new("INVALID_PATH", "请使用专用文件读取命令"));
    }
    api.json(&path, &query, authenticated).await
}

#[tauri::command]
pub async fn mcs_api_preview(
    api: State<'_, McsApiState>,
    blueprint_id: String,
    version: u32,
) -> Result<String, McsApiError> {
    let path = format!("/api/v1/blueprints/{blueprint_id}/versions/{version}/preview");
    let response = api.get(&path, &BTreeMap::new(), true).await?;
    let mime = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_owned();
    if !matches!(
        mime.as_str(),
        "image/png" | "image/jpeg" | "image/webp" | "image/avif"
    ) {
        return Err(McsApiError::new("PREVIEW", "预览图片尚未准备好"));
    }
    let data = read_bounded(response, MAX_PREVIEW_BYTES).await?;
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(data)
    ))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McsImportResult {
    filename: String,
    bytes: usize,
}

#[tauri::command]
pub async fn import_mcs_blueprint(
    app: AppHandle,
    api: State<'_, McsApiState>,
    blueprint_id: String,
    version: u32,
    authenticated: bool,
) -> Result<McsImportResult, McsApiError> {
    let _permit = api
        .imports
        .try_acquire()
        .map_err(|_| McsApiError::new("BUSY", "已有蓝图正在下载或解析，请等待完成"))?;
    let path = format!("/api/v1/blueprints/{blueprint_id}/versions/{version}");
    let detail = api.json(&path, &BTreeMap::new(), authenticated).await?;
    if detail
        .get("originalSourceByteSize")
        .and_then(Value::as_u64)
        .is_some_and(|n| n > MAX_SOURCE_BYTES as u64)
    {
        return Err(McsApiError::new(
            "TOO_LARGE",
            "原文件超过 256 MiB 输入上限（解压后的 NBT 上限为 1 GiB）",
        ));
    }
    let filename = source_filename(
        detail
            .get("originalFilename")
            .and_then(Value::as_str)
            .unwrap_or("blueprint"),
        detail
            .get("sourceFormat")
            .and_then(Value::as_str)
            .unwrap_or(""),
    )?;
    let response = api
        .get(&format!("{path}/download"), &BTreeMap::new(), authenticated)
        .await?;
    let data = read_bounded(response, MAX_SOURCE_BYTES).await?;
    let bytes = data.len();
    if bytes == 0 {
        return Err(McsApiError::new("EMPTY_FILE", "下载的蓝图文件为空"));
    }
    // Parsing, compression and SQLite updates must not occupy the UI thread
    // or serialize millions of byte values through the WebView.
    encode_uploaded_schematic(app, filename.clone(), data, false, -1)
        .await
        .map_err(|message| McsApiError::new("IMPORT", &format!("本地解析失败：{message}")))?;
    Ok(McsImportResult { filename, bytes })
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "01a14549-a8f5-7c10-810f-591eee61f175";

    // A real HTTP peer with deterministic response headers. Outbound API URLs
    // are recorded before the test-only transport changes the socket address.
    // No real API key, production request, custom CA, or TLS bypass is used.
    async fn loopback_get<'a>(
        api: &'a McsApiState,
        replies: Vec<String>,
        authenticated: bool,
    ) -> (
        Result<LimitedResponse<'a>, McsApiError>,
        Vec<(Url, bool)>,
        Vec<String>,
    ) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let server = std::thread::spawn(move || {
            let mut received = Vec::new();
            for reply in replies {
                let deadline = Instant::now() + Duration::from_secs(5);
                let mut socket = loop {
                    match listener.accept() {
                        Ok((socket, _)) => break socket,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            assert!(Instant::now() < deadline, "test HTTP request timed out");
                            std::thread::sleep(Duration::from_millis(5));
                        }
                        Err(error) => panic!("test HTTP accept: {error}"),
                    }
                };
                socket
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut bytes = Vec::new();
                while !bytes.windows(4).any(|w| w == b"\r\n\r\n") {
                    let mut chunk = [0; 1024];
                    let count = socket.read(&mut chunk).unwrap();
                    assert!(count > 0 && bytes.len() < 16 * 1024);
                    bytes.extend_from_slice(&chunk[..count]);
                }
                received.push(String::from_utf8(bytes).unwrap().to_ascii_lowercase());
                socket.write_all(reply.as_bytes()).unwrap();
                socket.flush().unwrap();
            }
            received
        });
        let transport = Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap();
        let mut outgoing = Vec::new();
        let result = api
            .get_with(
                "/api/v1/account/blueprints",
                &BTreeMap::new(),
                authenticated,
                |mut request| {
                    assert_eq!(request.method(), reqwest::Method::GET);
                    outgoing.push((
                        request.url().clone(),
                        request.headers().contains_key(header::AUTHORIZATION),
                    ));
                    let route = format!(
                        "http://{address}{}{}",
                        request.url().path(),
                        request
                            .url()
                            .query()
                            .map_or(String::new(), |q| format!("?{q}"))
                    );
                    *request.url_mut() = Url::parse(&route).unwrap();
                    transport.execute(request)
                },
            )
            .await;
        (result, outgoing, server.join().unwrap())
    }

    fn reply(status: u16, headers: &str) -> String {
        format!(
            "HTTP/1.1 {status} Test\r\n{headers}Content-Length: 2\r\nConnection: close\r\n\r\n{{}}"
        )
    }

    #[test]
    fn http_redirect_chain_strips_credentials_permanently_after_leaving_api_scope() {
        tauri::async_runtime::block_on(async {
            let api = McsApiState::new().unwrap();
            *api.key.lock().unwrap() = Some("mcs_live_test_not_a_real_key".into());
            let (result, requests, wire) = loopback_get(
                &api,
                vec![
                    reply(302, "Location: /api/v1/categories\r\n"),
                    reply(
                        307,
                        "Location: https://cdn.mcschematic.top/objects/test\r\n",
                    ),
                    reply(
                        303,
                        "Location: https://www.mcschematic.top/api/v1/categories\r\n",
                    ),
                    reply(200, ""),
                ],
                true,
            )
            .await;
            assert_eq!(
                requests.iter().map(|r| r.1).collect::<Vec<_>>(),
                [true, true, false, false]
            );
            assert_eq!(
                wire.iter()
                    .map(|r| r.contains("authorization: bearer "))
                    .collect::<Vec<_>>(),
                [true, true, false, false]
            );
            assert_eq!(requests[2].0.host_str(), Some("cdn.mcschematic.top"));
            assert!(requests.iter().all(|r| !r.0.as_str().contains("mcs_live_")));
            assert_eq!(api.requests.available_permits(), 3);
            assert_eq!(read_bounded(result.unwrap(), 32).await.unwrap(), b"{}");
            assert_eq!(api.requests.available_permits(), 4);
        });
    }

    #[test]
    fn http_anonymous_requests_never_attach_a_connected_key() {
        tauri::async_runtime::block_on(async {
            let api = McsApiState::new().unwrap();
            *api.key.lock().unwrap() = Some("mcs_live_test_not_a_real_key".into());
            let (result, requests, wire) = loopback_get(&api, vec![reply(200, "")], false).await;
            assert!(!requests[0].1);
            assert!(!wire[0].contains("authorization:"));
            drop(result.unwrap());
            assert_eq!(api.requests.available_permits(), 4);
        });
    }

    #[test]
    fn http_status_errors_are_specific_and_release_request_slots() {
        tauri::async_runtime::block_on(async {
            for (status, code) in [
                (400, "BAD_REQUEST"),
                (401, "AUTH_REQUIRED"),
                (403, "FORBIDDEN"),
                (404, "NOT_FOUND"),
                (410, "NOT_FOUND"),
                (503, "SERVER"),
            ] {
                let api = McsApiState::new().unwrap();
                let (result, _, _) = loopback_get(&api, vec![reply(status, "")], false).await;
                let error = result.err().unwrap();
                assert_eq!(error.code, code);
                assert!(!error.message.contains("mcs_live_"));
                assert_eq!(api.requests.available_permits(), 4);
            }
        });
    }

    #[test]
    fn http_rate_limit_is_bounded_and_blocks_retry_before_sending() {
        tauri::async_runtime::block_on(async {
            for (value, seconds) in [("0", 1), ("999999", 3600), ("invalid", 60)] {
                let api = McsApiState::new().unwrap();
                let (result, _, _) = loopback_get(
                    &api,
                    vec![reply(429, &format!("Retry-After: {value}\r\n"))],
                    false,
                )
                .await;
                let error = result.err().unwrap();
                assert_eq!(error.code, "RATE_LIMITED");
                assert_eq!(error.retry_after_seconds, Some(seconds));
                let second = api
                    .get_with("/api/v1/categories", &BTreeMap::new(), false, |_| async {
                        panic!("rate-limited requests must not reach the transport");
                        #[allow(unreachable_code)]
                        Err::<Response, reqwest::Error>(unreachable!())
                    })
                    .await;
                assert_eq!(second.err().unwrap().code, "RATE_LIMITED");
                assert_eq!(api.requests.available_permits(), 4);
            }
        });
    }

    #[test]
    fn http_bad_redirects_stop_before_following_and_loops_are_bounded() {
        tauri::async_runtime::block_on(async {
            for (headers, code) in [
                ("", "REDIRECT"),
                (
                    "Location: https://mcschematic.top.evil.test/stolen\r\n",
                    "UNTRUSTED_REDIRECT",
                ),
                (
                    "Location: http://www.mcschematic.top/api/v1/categories\r\n",
                    "UNTRUSTED_REDIRECT",
                ),
                (
                    "Location: https://user@www.mcschematic.top/api/v1/categories\r\n",
                    "UNTRUSTED_REDIRECT",
                ),
                (
                    "Location: https://www.mcschematic.top:8443/api/v1/categories\r\n",
                    "UNTRUSTED_REDIRECT",
                ),
            ] {
                let api = McsApiState::new().unwrap();
                let (result, requests, _) =
                    loopback_get(&api, vec![reply(302, headers)], false).await;
                assert_eq!(result.err().unwrap().code, code);
                assert_eq!(requests.len(), 1);
                assert_eq!(api.requests.available_permits(), 4);
            }
            let api = McsApiState::new().unwrap();
            let (result, requests, _) = loopback_get(
                &api,
                vec![reply(302, "Location: /api/v1/categories\r\n"); 5],
                false,
            )
            .await;
            assert_eq!(result.err().unwrap().code, "REDIRECT");
            assert_eq!(requests.len(), 5);
            assert_eq!(api.requests.available_permits(), 4);
        });
    }

    #[test]
    fn disconnected_account_fails_before_transport_and_releases_slot() {
        tauri::async_runtime::block_on(async {
            let api = McsApiState::new().unwrap();
            let result = api
                .get_with(
                    "/api/v1/account/blueprints",
                    &BTreeMap::new(),
                    true,
                    |_| async {
                        panic!("disconnected account must not reach transport");
                        #[allow(unreachable_code)]
                        Err::<Response, reqwest::Error>(unreachable!())
                    },
                )
                .await;
            assert_eq!(result.err().unwrap().code, "AUTH_REQUIRED");
            assert_eq!(api.requests.available_permits(), 4);
        });
    }

    #[test]
    #[ignore = "Explicit live public-API check; downloads a small public fixture without writing user data"]
    fn live_public_source_is_readable_by_desktop_parser() {
        tauri::async_runtime::block_on(async {
            let api = McsApiState::new().unwrap();
            let list = api
                .json(
                    "/api/v1/blueprints",
                    &BTreeMap::from([
                        ("limit".into(), "1".into()),
                        ("extra".into(), "none".into()),
                    ]),
                    false,
                )
                .await
                .unwrap();
            assert!(list["items"].is_array());
            assert!(list["totalCount"].as_u64().is_some());
            let path = format!("/api/v1/blueprints/{ID}/versions/1");
            let detail = api.json(&path, &BTreeMap::new(), false).await.unwrap();
            assert_eq!(detail["sourceFormat"], "building_gadgets");
            let response = api
                .get(&format!("{path}/download"), &BTreeMap::new(), false)
                .await
                .unwrap();
            let bytes = read_bounded(response, MAX_JSON_BYTES).await.unwrap();
            assert_eq!(
                bytes.len() as u64,
                detail["originalSourceByteSize"].as_u64().unwrap()
            );
            let schematic =
                crate::building_gadges::bg_schematic::BgSchematic::new_from_data(bytes).unwrap();
            let blocks = schematic.get_blocks_pos().unwrap();
            assert!(!blocks.blocks.elements.is_empty());
        });
    }

    #[test]
    fn read_only_paths_are_constrained() {
        for path in [
            "/api/v1/categories".to_owned(),
            format!("/api/v1/blueprints/{ID}/versions/12/download"),
            "/api/v1/account/favourites".into(),
        ] {
            assert!(validate_path(&path).is_ok());
        }
        for path in [
            "https://evil.test/api/v1/blueprints",
            "/api/v1/admin",
            "/api/v1/../settings",
            "/api/v1/blueprints/../../settings",
            "/api/v1/blueprints?token=secret",
        ] {
            assert!(validate_path(path).is_err());
        }
        assert!(validate_path(&format!("/api/v1/blueprints/{ID}/versions/0")).is_err());
    }

    #[test]
    fn redirect_scope_does_not_leak_credentials() {
        let api = Url::parse(&format!("{API_ORIGIN}/api/v1/blueprints")).unwrap();
        assert!(sends_credentials(&api));
        let cdn = Url::parse("https://cdn.mcschematic.top/objects/test").unwrap();
        assert!(allowed_redirect(&cdn));
        assert!(!sends_credentials(&cdn));
        for raw in [
            "http://www.mcschematic.top/test",
            "https://mcschematic.top.evil.test/test",
            "https://127.0.0.1/test",
            "https://user@www.mcschematic.top/test",
            "https://www.mcschematic.top:8443/test",
        ] {
            let url = Url::parse(raw).unwrap();
            assert!(!allowed_redirect(&url));
            assert!(!sends_credentials(&url));
        }
        assert!(!sends_credentials(
            &Url::parse("https://www.mcschematic.top/objects/test").unwrap()
        ));
    }

    #[test]
    fn queries_cannot_contain_credentials_or_mixed_pagination() {
        assert!(validate_query(&BTreeMap::from([("q".into(), "城堡".into())])).is_ok());
        assert!(validate_query(&BTreeMap::from([("token".into(), "secret".into())])).is_err());
        assert!(
            validate_query(&BTreeMap::from([
                ("page".into(), "1".into()),
                ("cursor".into(), "opaque".into())
            ]))
            .is_err()
        );
    }

    #[test]
    fn filenames_use_exact_format_extensions_and_no_paths() {
        assert_eq!(
            source_filename("测试.mcstruct", "bedrock_edition").unwrap(),
            "测试.mcstructure"
        );
        assert_eq!(
            source_filename("castle.schematic", "mcedit").unwrap(),
            "castle.schematic"
        );
        assert_eq!(
            source_filename("../../城堡.litematic", "litematica").unwrap(),
            "城堡.litematic"
        );
        assert!(source_filename("unknown.exe", "unknown").is_err());
    }

    #[test]
    fn body_read_owns_the_concurrency_permit_and_releases_it_on_limits() {
        tauri::async_runtime::block_on(async {
            let semaphore = tokio::sync::Semaphore::new(1);
            let response = tauri::http::Response::builder()
                .header("Content-Length", "4")
                .body("test")
                .unwrap();
            let response = LimitedResponse {
                response: response.into(),
                _permit: semaphore.acquire().await.unwrap(),
            };
            assert_eq!(semaphore.available_permits(), 0);
            assert_eq!(read_bounded(response, 4).await.unwrap(), b"test");
            assert_eq!(semaphore.available_permits(), 1);
            let response = tauri::http::Response::builder()
                .header("Content-Length", "5")
                .body("large")
                .unwrap();
            let response = LimitedResponse {
                response: response.into(),
                _permit: semaphore.acquire().await.unwrap(),
            };
            assert_eq!(
                read_bounded(response, 4).await.unwrap_err().code,
                "TOO_LARGE"
            );
            assert_eq!(semaphore.available_permits(), 1);
            let response = tauri::http::Response::builder()
                .body("unannounced")
                .unwrap();
            let response = LimitedResponse {
                response: response.into(),
                _permit: semaphore.acquire().await.unwrap(),
            };
            assert_eq!(
                read_bounded(response, 4).await.unwrap_err().code,
                "TOO_LARGE"
            );
            assert_eq!(semaphore.available_permits(), 1);
            let response = tauri::http::Response::builder().body("cancelled").unwrap();
            drop(LimitedResponse {
                response: response.into(),
                _permit: semaphore.acquire().await.unwrap(),
            });
            assert_eq!(semaphore.available_permits(), 1);
        });
    }

    #[test]
    fn truncated_http_body_is_a_network_error_and_releases_the_slot() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = [0; 4096];
            socket.read(&mut request).unwrap();
            socket
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\nConnection: close\r\n\r\nabc")
                .unwrap();
            socket.flush().unwrap();
        });
        tauri::async_runtime::block_on(async {
            let slots = tokio::sync::Semaphore::new(1);
            let client = Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(3))
                .build()
                .unwrap();
            let response = client
                .get(format!("http://{address}/test"))
                .send()
                .await
                .unwrap();
            let response = LimitedResponse {
                response,
                _permit: slots.acquire().await.unwrap(),
            };
            assert_eq!(
                read_bounded(response, 32).await.unwrap_err().code,
                "NETWORK"
            );
            assert_eq!(slots.available_permits(), 1);
        });
        server.join().unwrap();
    }
}
