// app.json 的原生配置体检。
//
// 为什么值得测:权限说明写错了,代价是 App Store 审核退回 —— 而这件事
// 只有在提交之后才会知道,一个来回好几天。这里几秒钟就能查出来。
//
// 已经踩过的坑:NSPhotoLibraryUsageDescription 被写了两遍(ios.infoPlist 一份、
// expo-image-picker 插件一份),而插件那份会在 prebuild 时覆盖前者。
// 结果是「实际打进包里的说明,比 App 真正的用途更窄」—— 典型退回项。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = JSON.parse(readFileSync(new URL('../../../app.json', import.meta.url), 'utf8')).expo;

const pluginOpts = (name) => {
  const found = app.plugins.find(p => (Array.isArray(p) ? p[0] : p) === name);
  assert.ok(found, `app.json 的 plugins 里没有 ${name}`);
  return Array.isArray(found) ? (found[1] || {}) : {};
};

test('显示名是「言」', () => {
  assert.equal(app.name, '言');
});

test('ios.infoPlist 不再自己写 NSPhotoLibraryUsageDescription', () => {
  // 写了也没用 —— 插件会覆盖它。留着只会让人以为生效了。
  assert.equal(app.ios?.infoPlist?.NSPhotoLibraryUsageDescription, undefined,
    '相册权限说明应只在插件里定义,否则会被插件静默覆盖');
});

test('所有会写 NSPhotoLibraryUsageDescription 的插件,说明必须完全一致', () => {
  // 两个插件写的是同一个 Info.plist 键,plugins 数组里靠后的那个赢。
  // 不一致的话,生效的是哪句取决于数组顺序 —— 这种依赖太隐蔽,直接禁掉。
  const picker = pluginOpts('expo-image-picker').photosPermission;
  const media = pluginOpts('expo-media-library').photosPermission;
  assert.ok(picker, 'expo-image-picker 缺 photosPermission');
  assert.ok(media, 'expo-media-library 缺 photosPermission');
  assert.equal(picker, media,
    '两个插件的相册说明不一致,生效的将取决于 plugins 数组顺序');
});

test('权限说明覆盖了 App 实际的三种相册用途', () => {
  // 说明比实际用途窄 = 审核退回。代码里确实有这三处在读相册。
  const text = pluginOpts('expo-image-picker').photosPermission;
  for (const [用途, 关键词] of [
    ['打卡照片', '打卡'],
    ['行程截图识别', '行程'],
    ['EXIF 补全足迹', '拍摄时间'],
  ]) {
    assert.ok(text.includes(关键词), `权限说明没有覆盖「${用途}」`);
  }
});

test('不申请「写入相册」权限 —— 言不往用户相册里存东西', () => {
  assert.equal(pluginOpts('expo-media-library').savePhotosPermission, false,
    'false 会删掉 NSPhotoLibraryAddUsageDescription;申请用不到的权限同样会被问');
});

test('Android 开了 ACCESS_MEDIA_LOCATION —— 没有它读不到照片的 GPS', () => {
  assert.equal(pluginOpts('expo-media-library').isAccessMediaLocationEnabled, true,
    'EXIF 导入要靠它拿坐标,漏了会表现为「所有照片都没有位置」');
});

test('声明了不含豁免加密 —— 缺了每次提交都会被问一遍', () => {
  assert.equal(app.ios?.infoPlist?.ITSAppUsesNonExemptEncryption, false);
});

test('不申请相机和麦克风 —— 代码里一处都没用到', () => {
  // 默认值是英文 boilerplate('Allow $(PRODUCT_NAME) to access your camera'),
  // 在一个全中文 App 里既难看又会被问;更要紧的是 Android 会因此真的申请
  // CAMERA / RECORD_AUDIO。申请用不到的权限,两个商店都视为问题。
  const picker = pluginOpts('expo-image-picker');
  assert.equal(picker.cameraPermission, false);
  assert.equal(picker.microphonePermission, false);
});

test('不申请定位权限 —— 言只用系统地理编码,iOS 上那不需要权限', () => {
  // expo-location 文档里「must request location permissions」只针对 Android。
  // iOS 的 CLGeocoder 不需要授权,所以三条 usage description 全部删掉。
  // 一个不做位置追踪的 App 去要定位权限,审核一定会问。
  // 三个键是分开的,漏掉任何一个都会留下英文默认值
  // 'Allow $(PRODUCT_NAME) to access your location' —— 已经漏过一次。
  const loc = pluginOpts('expo-location');
  assert.equal(loc.locationWhenInUsePermission, false);
  assert.equal(loc.locationAlwaysPermission, false);
  assert.equal(loc.locationAlwaysAndWhenInUsePermission, false);
  assert.equal(loc.isIosBackgroundLocationEnabled, false, '后台定位会加 UIBackgroundModes,必然被问');
});

test('相册权限只要照片,不要音频和视频', () => {
  // expo-media-library 默认 ['photo','video','audio'],会申请 READ_MEDIA_AUDIO
  // 和 READ_MEDIA_VIDEO —— 言只读照片的 EXIF。
  assert.deepEqual(pluginOpts('expo-media-library').granularPermissions, ['photo']);
});
