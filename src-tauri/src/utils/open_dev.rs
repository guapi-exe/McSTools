use tauri::Manager;

#[tauri::command]
pub async fn open_dev(
    app: tauri::AppHandle
) -> Result<(), String> {
    #[cfg(all(debug_assertions, target_os = "windows"))]
    {
        let window = app.get_webview_window("main")
            .ok_or("Unable to retrieve the main window")?;

        window.open_devtools();
        return Ok(());
    }

    #[cfg(not(all(debug_assertions, target_os = "windows")))]
    {
        let _ = app;
        Err("当前仅调试包支持打开开发者工具，请使用 debug 构建。".to_string())
    }
}