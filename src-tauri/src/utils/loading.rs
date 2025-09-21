use tauri::{AppHandle, Manager};
use tokio::time::{sleep, Duration};

#[tauri::command]
pub async fn close_splashscreen(app: AppHandle) {
    //println!("Closing splashscreen");
    if let Some(splashscreen) = app.get_webview_window("splashscreen") {
        sleep(Duration::from_secs(1)).await;
        splashscreen.close().unwrap();
    }
    app.get_webview_window("main").unwrap().show().unwrap();
}
