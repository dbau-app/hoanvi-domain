<?php
/**
 * Plugin Name: HoanVi Bridge
 * Description: WordPress server-side bridge for the HoanVí Apps Script + Google Sheets backend.
 * Version: 1.0.0
 * Author: HoanVí
 */
if (!defined('ABSPATH')) exit;

define('HOANVI_BRIDGE_VERSION', '1.0.0');

define('HOANVI_API_OPTION', 'hoanvi_apps_script_api_url');

function hoanvi_bridge_api_url() {
    return trim((string)get_option(HOANVI_API_OPTION, ''));
}

function hoanvi_bridge_request($payload) {
    $url = hoanvi_bridge_api_url();
    if (!$url) return new WP_Error('hoanvi_api_missing', 'Chưa cấu hình URL Apps Script API.');

    $response = wp_remote_post($url, array(
        'timeout' => 25,
        'redirection' => 5,
        'headers' => array('Content-Type' => 'application/json; charset=utf-8', 'Accept' => 'application/json'),
        'body' => wp_json_encode($payload),
    ));

    if (is_wp_error($response)) return $response;
    $code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);
    $json = json_decode($body, true);

    if (!is_array($json)) {
        return new WP_Error('hoanvi_api_invalid', 'Apps Script trả về dữ liệu không hợp lệ.', array('status' => $code, 'body' => $body));
    }
    return $json;
}

function hoanvi_bridge_ajax() {
    check_ajax_referer('hoanvi_nonce', 'nonce');
    $raw = isset($_POST['payload']) ? wp_unslash($_POST['payload']) : '{}';
    $payload = json_decode($raw, true);
    if (!is_array($payload)) wp_send_json(array('success'=>false,'message'=>'Payload không hợp lệ.'), 400);

    // Không cho client tự đổi endpoint/action ngoài danh sách backend.
    $allowed = array('registerUser','loginUser','verifyEmail','resendVerification','requestPasswordReset','resetPassword','changePassword','logoutUser','getDashboard','createTrackingLink','getLinkProductMetadata','requestWithdrawal','adminGetLinks','adminGetWithdrawals','adminUpdateLinkCommission','adminCancelLink','adminCompleteWithdrawal','adminBackfillProductMetadata','health');
    if (empty($payload['action']) || !in_array($payload['action'], $allowed, true)) wp_send_json(array('success'=>false,'message'=>'Action không được phép.'), 400);

    $result = hoanvi_bridge_request($payload);
    if (is_wp_error($result)) wp_send_json(array('success'=>false,'message'=>$result->get_error_message()), 502);
    wp_send_json($result);
}
add_action('wp_ajax_hoanvi_api', 'hoanvi_bridge_ajax');
add_action('wp_ajax_nopriv_hoanvi_api', 'hoanvi_bridge_ajax');

function hoanvi_bridge_shortcode($atts = array()) {
    $nonce = wp_create_nonce('hoanvi_nonce');
    ob_start(); ?>
    <div id="hoanvi-app-root" data-ajax-url="<?php echo esc_attr(admin_url('admin-ajax.php')); ?>" data-nonce="<?php echo esc_attr($nonce); ?>">
        <div class="hoanvi-loading">Đang tải HoànVí…</div>
    </div>
    <?php
    return ob_get_clean();
}
add_shortcode('hoanvi_app', 'hoanvi_bridge_shortcode');

function hoanvi_bridge_enqueue() {
    if (!is_singular()) return;
    global $post;
    if (!$post || !has_shortcode($post->post_content, 'hoanvi_app')) return;
    wp_enqueue_style('hoanvi-app', plugins_url('assets/hoanvi.css', __FILE__), array(), HOANVI_BRIDGE_VERSION);
    wp_enqueue_script('hoanvi-app', plugins_url('assets/hoanvi.js', __FILE__), array(), HOANVI_BRIDGE_VERSION, true);
}
add_action('wp_enqueue_scripts', 'hoanvi_bridge_enqueue');

function hoanvi_bridge_admin_menu() {
    add_options_page('HoànVí', 'HoànVí', 'manage_options', 'hoanvi-bridge', 'hoanvi_bridge_settings_page');
}
add_action('admin_menu', 'hoanvi_bridge_admin_menu');

function hoanvi_bridge_register_settings() {
    register_setting('hoanvi_bridge', HOANVI_API_OPTION, array('sanitize_callback' => 'esc_url_raw'));
}
add_action('admin_init', 'hoanvi_bridge_register_settings');

function hoanvi_bridge_settings_page() { ?>
    <div class="wrap">
        <h1>HoànVí Bridge</h1>
        <p>Nhập URL Web App Apps Script đã deploy ở chế độ <b>Execute as: Me</b> và <b>Who has access: Anyone</b>.</p>
        <form method="post" action="options.php">
            <?php settings_fields('hoanvi_bridge'); ?>
            <table class="form-table"><tr><th scope="row"><label for="hoanvi_apps_script_api_url">Apps Script API URL</label></th><td><input type="url" class="regular-text" id="hoanvi_apps_script_api_url" name="<?php echo esc_attr(HOANVI_API_OPTION); ?>" value="<?php echo esc_attr(hoanvi_bridge_api_url()); ?>" placeholder="https://script.google.com/macros/s/.../exec"></td></tr></table>
            <?php submit_button('Lưu cấu hình'); ?>
        </form>
        <hr>
        <p>Thêm shortcode <code>[hoanvi_app]</code> vào trang WordPress để hiển thị HoànVí.</p>
    </div>
<?php }
