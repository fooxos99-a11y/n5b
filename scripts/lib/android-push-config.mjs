export function validateAndroidPushConfig(config, applicationId) {
  if (!config?.project_info?.project_id || !config.project_info.project_number) {
    throw new Error('Firebase project configuration is missing.');
  }
  const clients = config.client || [];
  if (clients.length !== 1 || clients[0].client_info?.android_client_info?.package_name !== applicationId) {
    throw new Error('Firebase configuration must belong exclusively to the selected Android application.');
  }
  if (!clients[0].client_info?.mobilesdk_app_id || !clients[0].api_key?.[0]?.current_key) {
    throw new Error('Firebase Android client registration is incomplete.');
  }
}
