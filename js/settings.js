// 获取 NW.js 窗口对象
const win = nw.Window.get();

// DOM 元素
const backButton = document.getElementById('back-button');
const minimizeBtn = document.querySelector('.minimize-btn');
const navItems = document.querySelectorAll('.settings-nav-item');
const sections = document.querySelectorAll('.settings-section');
const bitrateSlider = document.getElementById('video-bitrate');
const bitrateValue = document.getElementById('bitrate-value');
const jpegQualitySlider = document.getElementById('jpeg-quality');
const qualityValue = document.getElementById('quality-value');
const browseBtn = document.getElementById('browse-btn');
const checkUpdateBtn = document.getElementById('check-update-btn');
const feedbackBtn = document.getElementById('feedback-btn');
const settingsVideoPreview = document.getElementById('settings-video-preview');

// 相机流变量
let cameraStream = null;

// 应用程序设置
let appSettings = {
    camera: {
        device: 'default',
        resolution: '1080p',
        framerate: '30',
        mirror: true,
        sound: true
    },
    video: {
        format: 'webm',
        quality: 'high',
        bitrate: 8,
        audio: true,
        audioDevice: 'default'
    },
    photo: {
        format: 'png',
        jpegQuality: 90,
        savePath: 'Pictures/Camera',
        autoSave: true
    }
};

// 添加分辨率映射
const resolutionMap = {
    '2.1MP 16:9': { width: 1920, height: 1080 },
    '0.9MP 16:9': { width: 1280, height: 720 },
    '5.0MP 4:3': { width: 2592, height: 1944 },
    '3.1MP 4:3': { width: 2048, height: 1536 },
    '1.9MP 4:3': { width: 1600, height: 1200 },
    '0.8MP 4:3': { width: 1024, height: 768 },
    '0.5MP 4:3': { width: 800, height: 600 },
    '0.3MP 4:3': { width: 640, height: 480 },
    '0.08MP 4:3': { width: 320, height: 240 }
};

// 初始化
async function init() {
    // 加载设备列表
    await loadDevices();
    
    // 加载设置
    loadSettings();
    
    // 监听设置变更
    attachSettingsListeners();
    
    // 初始化相机预览
    initCameraPreview();
    
    // 确保滑块填充效果正确渲染
    initSliders();
}

// 初始化相机预览
async function initCameraPreview() {
    try {
        // 尝试从主窗口获取现有流
        let mainStream = null;
        
        // 尝试多种方式获取主窗口引用
        const mainWindow = window.opener || window.mainWindow;
        
        if (mainWindow) {
            try {
                // 尝试获取主窗口的流
                if (mainWindow.currentStream) {
                    console.log('从主窗口获取相机流');
                    mainStream = mainWindow.currentStream;
                }
            } catch (err) {
                console.warn('访问主窗口的流时出错，将创建新流:', err);
            }
        }
        
        if (mainStream) {
            try {
                // 尝试克隆主窗口的流
                const tracks = mainStream.getVideoTracks();
                if (tracks.length > 0) {
                    cameraStream = new MediaStream([tracks[0]]);
                    settingsVideoPreview.srcObject = cameraStream;
                    
                    // 应用镜像设置
                    applyMirrorSettingToPreview();
                    
                    console.log('成功使用主窗口的流');
                    return;
                }
            } catch (cloneErr) {
                console.warn('克隆主窗口流失败，将创建新流:', cloneErr);
            }
        }
        
        // 创建新的摄像头流
        console.log('创建新的相机流');
        const constraints = {
            video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };
        
        // 如果有选定的摄像头设备，使用它
        const cameraSelect = document.getElementById('camera-select');
        if (cameraSelect && cameraSelect.value !== 'default') {
            constraints.video.deviceId = { exact: cameraSelect.value };
        }
        
        // 获取新的媒体流
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        settingsVideoPreview.srcObject = cameraStream;
        
        // 应用镜像设置
        applyMirrorSettingToPreview();
        
    } catch (err) {
        console.error('初始化摄像头预览失败:', err);
        // 不显示错误通知，因为视频预览是次要功能
    }
}

// 应用镜像设置到预览
function applyMirrorSettingToPreview() {
    try {
        if (settingsVideoPreview) {
            const mirrorToggle = document.getElementById('mirror-toggle');
            const isMirrored = mirrorToggle ? mirrorToggle.checked : appSettings.camera.mirror;
            
            settingsVideoPreview.style.transform = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
            console.log('已应用镜像设置到设置预览:', isMirrored ? '已镜像' : '未镜像');
        }
    } catch (err) {
        console.warn('应用镜像设置到预览失败:', err);
    }
}

// 停止相机预览
function stopCameraPreview() {
    if (cameraStream) {
        // 停止所有轨道
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

// 加载相机和音频设备
async function loadDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // 视频设备
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const cameraSelect = document.getElementById('camera-select');
        
        // 清空现有选项
        while (cameraSelect.options.length > 1) {
            cameraSelect.remove(1);
        }
        
        // 已知虚拟摄像头关键词列表
        const virtualCameraKeywords = [
            'screen', 'capture', 'plug-in', 'plugin', 'virtual', 
            'corel', 'obs', 'droidcam', 'iriun', 'ndi', 
            'snap', 'xsplit', 'manycam', 'camtwist', 'epoccam'
        ];
        
        // 检查设备是否可能是虚拟摄像头
        function isLikelyVirtualCamera(deviceLabel) {
            const lowerLabel = deviceLabel.toLowerCase();
            return virtualCameraKeywords.some(keyword => lowerLabel.includes(keyword.toLowerCase()));
        }
        
        // 对设备进行分类并排序
        const categorizedDevices = videoDevices.map(device => {
            const isVirtual = device.label ? isLikelyVirtualCamera(device.label) : false;
            return {
                device,
                isVirtual,
                // 为设备添加显示名称和分类标签
                displayName: device.label || `相机 ${cameraSelect.options.length}`,
                optionText: device.label 
                    ? `${isVirtual ? '[虚拟] ' : '[实体] '}${device.label}` 
                    : `相机 ${cameraSelect.options.length}`
            };
        });
        
        // 首先添加物理摄像头，然后添加虚拟摄像头
        const physicalCameras = categorizedDevices.filter(item => !item.isVirtual);
        const virtualCameras = categorizedDevices.filter(item => item.isVirtual);
        
        // 添加物理摄像头设备组
        if (physicalCameras.length > 0) {
            const physicalGroup = document.createElement('optgroup');
            physicalGroup.label = '实体摄像头';
            
            physicalCameras.forEach(item => {
                const option = document.createElement('option');
                option.value = item.device.deviceId;
                option.text = item.displayName;
                option.dataset.isVirtual = 'false';
                physicalGroup.appendChild(option);
            });
            
            cameraSelect.appendChild(physicalGroup);
        }
        
        // 添加虚拟摄像头设备组
        if (virtualCameras.length > 0) {
            const virtualGroup = document.createElement('optgroup');
            virtualGroup.label = '虚拟摄像头';
            
            virtualCameras.forEach(item => {
                const option = document.createElement('option');
                option.value = item.device.deviceId;
                option.text = item.displayName;
                option.dataset.isVirtual = 'true';
                virtualGroup.appendChild(option);
            });
            
            cameraSelect.appendChild(virtualGroup);
        }
        
        // 如果没有检测到任何摄像头，显示提示信息
        if (videoDevices.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.text = '未检测到摄像头设备';
            option.disabled = true;
            cameraSelect.appendChild(option);
        }
        
        // 音频设备
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        const audioSelect = document.getElementById('audio-device');
        
        // 清空现有选项
        while (audioSelect.options.length > 1) {
            audioSelect.remove(1);
        }
        
        // 添加新设备
        audioDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `麦克风 ${audioSelect.options.length}`;
            audioSelect.appendChild(option);
        });
    } catch (err) {
        console.error('Error loading devices:', err);
        showNotification('加载设备列表失败', true);
    }
}

// 加载设置
function loadSettings() {
    // 尝试从存储中加载
    const savedSettings = localStorage.getItem('cameraAppSettings');
    if (savedSettings) {
        try {
            appSettings = JSON.parse(savedSettings);
        } catch (err) {
            console.error('Error parsing saved settings:', err);
        }
    }
    
    // 相机设置
    document.getElementById('camera-select').value = appSettings.camera.device;
    document.getElementById('resolution-select').value = appSettings.camera.resolution;
    document.getElementById('framerate-select').value = appSettings.camera.framerate;
    document.getElementById('mirror-toggle').checked = appSettings.camera.mirror;
    document.getElementById('sound-toggle').checked = appSettings.camera.sound;
    
    // 视频设置
    document.getElementById('video-format').value = appSettings.video.format;
    document.getElementById('video-quality').value = appSettings.video.quality;
    document.getElementById('video-bitrate').value = appSettings.video.bitrate;
    bitrateValue.textContent = `${appSettings.video.bitrate} Mbps`;
    document.getElementById('audio-toggle').checked = appSettings.video.audio;
    document.getElementById('audio-device').value = appSettings.video.audioDevice;
    
    // 照片设置
    document.getElementById('photo-format').value = appSettings.photo.format;
    document.getElementById('jpeg-quality').value = appSettings.photo.jpegQuality;
    qualityValue.textContent = `${appSettings.photo.jpegQuality}%`;
    document.getElementById('save-path').value = appSettings.photo.savePath;
    document.getElementById('auto-save').checked = appSettings.photo.autoSave;
    
    // 应用镜像设置到预览
    if (settingsVideoPreview) {
        settingsVideoPreview.style.transform = appSettings.camera.mirror ? 'scaleX(-1)' : 'scaleX(1)';
    }
    
    // 初始化滑块样式
    initSliders();
}

// 保存设置
function saveSettings() {
    // 相机设置
    appSettings.camera.device = document.getElementById('camera-select').value;
    appSettings.camera.resolution = document.getElementById('resolution-select').value;
    appSettings.camera.framerate = document.getElementById('framerate-select').value;
    appSettings.camera.mirror = document.getElementById('mirror-toggle').checked;
    appSettings.camera.sound = document.getElementById('sound-toggle').checked;
    
    // 视频设置
    appSettings.video.format = document.getElementById('video-format').value;
    appSettings.video.quality = document.getElementById('video-quality').value;
    appSettings.video.bitrate = parseInt(document.getElementById('video-bitrate').value);
    appSettings.video.audio = document.getElementById('audio-toggle').checked;
    appSettings.video.audioDevice = document.getElementById('audio-device').value;
    
    // 照片设置
    appSettings.photo.format = document.getElementById('photo-format').value;
    appSettings.photo.jpegQuality = parseInt(document.getElementById('jpeg-quality').value);
    appSettings.photo.savePath = document.getElementById('save-path').value;
    appSettings.photo.autoSave = document.getElementById('auto-save').checked;
    
    // 保存到本地存储
    localStorage.setItem('cameraAppSettings', JSON.stringify(appSettings));
    
    // showNotification('设置已保存');
}

// 更新视频约束并重新初始化流
async function updateVideoConstraints(deviceId = null) {
    try {
        const resolutionSelect = document.getElementById('resolution-select');
        const framerateSelect = document.getElementById('framerate-select');
        const cameraSelect = document.getElementById('camera-select');
        
        // 获取选择的分辨率
        const resolution = resolutionMap[resolutionSelect.value] || resolutionMap['0.9MP 16:9'];
        const framerate = parseInt(framerateSelect.value) || 30;

        // 构建视频约束
        const constraints = {
            video: {
                width: { ideal: resolution.width },
                height: { ideal: resolution.height },
                frameRate: { ideal: framerate }
            }
        };

        // 如果指定了设备ID，添加到约束中
        if (deviceId) {
            constraints.video.deviceId = { exact: deviceId };
            
            // 检查是否选择了虚拟摄像头
            const selectedOption = Array.from(cameraSelect.querySelectorAll('option'))
                .find(option => option.value === deviceId);
            
            if (selectedOption && selectedOption.dataset && selectedOption.dataset.isVirtual === 'true') {
                console.log('已选择虚拟摄像头:', selectedOption.text);
                showNotification('您选择了虚拟摄像头，某些功能可能受限', 5000);
            }
        }

        // 如果主窗口存在，更新其视频流
        if (window.mainWindow && window.mainWindow.currentStream) {
            // 停止当前流
            window.mainWindow.currentStream.getTracks().forEach(track => track.stop());
            
            // 获取新的流
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // 更新主窗口的视频流
            window.mainWindow.currentStream = newStream;
            window.mainWindow.preview.srcObject = newStream;
            
            // 更新设置预览
            if (settingsVideoPreview) {
                const videoTrack = newStream.getVideoTracks()[0];
                if (videoTrack) {
                    cameraStream = new MediaStream([videoTrack]);
                    settingsVideoPreview.srcObject = cameraStream;
                }
            }
            
            // 通知主窗口更新
            window.mainWindow.dispatchEvent(new Event('stream_updated'));
        }
        
        showNotification('视频设置已更新');
    } catch (err) {
        console.error('更新视频约束失败:', err);
        showNotification('更新视频设置失败，请重试', true);
    }
}

// 监听设置变更
function attachSettingsListeners() {
    // 导航项点击事件
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // 取消之前的活动状态
            navItems.forEach(navItem => navItem.classList.remove('active'));
            sections.forEach(section => section.classList.remove('active'));
            
            // 设置当前活动项
            item.classList.add('active');
            const sectionId = `${item.dataset.section}-section`;
            document.getElementById(sectionId).classList.add('active');
        });
    });
    
    // 码率滑块值更新
    bitrateSlider.addEventListener('input', () => {
        bitrateValue.textContent = `${bitrateSlider.value} Mbps`;
        // 更新滑块填充色
        updateSliderFill(bitrateSlider);
    });
    
    // JPEG质量滑块值实时更新
    const jpegQualitySlider = document.getElementById('jpeg-quality');
    const qualityValue = document.getElementById('quality-value');
    
    // 实时更新显示值
    jpegQualitySlider.addEventListener('input', (e) => {
        qualityValue.textContent = `${e.target.value}%`;
        // 更新滑块填充色
        updateSliderFill(jpegQualitySlider);
    });
    
    // 当滑动结束时保存设置
    jpegQualitySlider.addEventListener('change', (e) => {
        appSettings.photo.jpegQuality = parseInt(e.target.value);
        saveSettings();
    });
    
    // 浏览按钮点击
    browseBtn.addEventListener('click', () => {
        // 使用NW.js的文件选择对话框
        const chooser = document.createElement('input');
        chooser.type = 'file';
        chooser.nwdirectory = true; // 选择目录而不是文件
        
        chooser.addEventListener('change', (e) => {
            if (chooser.value) {
                document.getElementById('save-path').value = chooser.value;
            }
        });
        
        chooser.click();
    });
    
    // 检查更新按钮
    checkUpdateBtn.addEventListener('click', () => {
        showNotification('正在检查更新...');
        // 模拟检查更新过程
        setTimeout(() => {
            showNotification('已是最新版本');
        }, 1500);
    });
    
    // 反馈按钮
    feedbackBtn.addEventListener('click', () => {
        nw.Shell.openExternal('mailto:support@example.com?subject=相机应用反馈');
    });
    
    // 镜像设置变更
    document.getElementById('mirror-toggle').addEventListener('change', (e) => {
        const isMirrored = e.target.checked;
        console.log('镜像设置变更:', isMirrored ? '开启' : '关闭');
        
        // 更新本地设置并保存到存储
        try {
            // 应用到当前设置
            appSettings.camera.mirror = isMirrored;
            
            // 更新设置预览
            applyMirrorSettingToPreview();
            
            // 保存设置到本地存储
            localStorage.setItem('cameraAppSettings', JSON.stringify(appSettings));
            
            // 显示成功通知
            showNotification(isMirrored ? '已开启镜像预览' : '已关闭镜像预览');
        } catch (err) {
            console.error('更新本地镜像设置时出错:', err);
        }
        
        // 尝试更新主窗口设置 - 使用多种方法，提高成功率
        updateMainWindowMirrorSetting(isMirrored);
        
        // 保存其他设置
        saveSettings();
    });
    
    // 尝试使用多种方法更新主窗口的镜像设置
    function updateMainWindowMirrorSetting(isMirrored) {
        // 尝试获取主窗口引用
        const mainWindow = window.opener || window.mainWindow;
        if (!mainWindow) {
            console.warn('无法获取主窗口引用，镜像设置仅保存在本地');
            return;
        }
        
        console.log('尝试更新主窗口的镜像设置...');
        
        // 方法追踪状态
        let updateSuccess = false;
        
        try {
            // 方法1: 直接更新主窗口的appSettings
            if (mainWindow.appSettings) {
                mainWindow.appSettings.camera.mirror = isMirrored;
                updateSuccess = true;
                console.log('方法1成功: 已直接更新主窗口设置对象');
            }
        } catch (err) {
            console.warn('方法1失败: 更新主窗口设置对象时出错', err);
        }
        
        try {
            // 方法2: 更新DOM元素
            if (mainWindow.document) {
                const previewElement = mainWindow.document.getElementById('preview');
                if (previewElement) {
                    previewElement.style.transform = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
                    updateSuccess = true;
                    console.log('方法2成功: 已直接更新主窗口DOM元素');
                }
                
                const processedPreview = mainWindow.document.getElementById('processed-preview');
                if (processedPreview) {
                    processedPreview.style.transform = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
                    updateSuccess = true;
                }
            }
        } catch (err) {
            console.warn('方法2失败: 更新主窗口DOM元素时出错', err);
        }
        
        try {
            // 方法3: 使用updateMirrorSetting函数
            if (typeof mainWindow.updateMirrorSetting === 'function') {
                mainWindow.updateMirrorSetting(isMirrored);
                updateSuccess = true;
                console.log('方法3成功: 已调用主窗口的updateMirrorSetting函数');
            }
        } catch (err) {
            console.warn('方法3失败: 调用updateMirrorSetting函数时出错', err);
        }
        
        try {
            // 方法4: 触发事件
            if (typeof mainWindow.dispatchEvent === 'function') {
                // 在触发事件前，尝试确保主窗口的appSettings已更新
                if (mainWindow.localStorage) {
                    const settingsJson = JSON.stringify({
                        ...JSON.parse(localStorage.getItem('cameraAppSettings') || '{}'),
                        camera: {
                            ...JSON.parse(localStorage.getItem('cameraAppSettings') || '{}').camera,
                            mirror: isMirrored
                        }
                    });
                    mainWindow.localStorage.setItem('cameraAppSettings', settingsJson);
                }
                
                mainWindow.dispatchEvent(new Event('mirror_updated'));
                updateSuccess = true;
                console.log('方法4成功: 已在主窗口触发mirror_updated事件');
            }
        } catch (err) {
            console.warn('方法4失败: 触发事件时出错', err);
        }
        
        try {
            // 方法5: 使用postMessage
            mainWindow.postMessage({
                type: 'update_mirror',
                mirror: isMirrored
            }, '*');
            updateSuccess = true;
            console.log('方法5成功: 已发送postMessage消息');
        } catch (err) {
            console.warn('方法5失败: 发送postMessage消息时出错', err);
        }
        
        // 报告整体状态
        if (updateSuccess) {
            console.log('已成功更新主窗口的镜像设置');
        } else {
            console.error('所有更新主窗口镜像设置的方法均失败');
        }
    }
    
    // 分辨率变更监听
    document.getElementById('resolution-select').addEventListener('change', () => {
        updateVideoConstraints();
        saveSettings();
    });
    
    // 帧率变更监听
    document.getElementById('framerate-select').addEventListener('change', () => {
        updateVideoConstraints();
        saveSettings();
    });
    
    // 相机设备切换
    document.getElementById('camera-select').addEventListener('change', (e) => {
        updateVideoConstraints(e.target.value);
        saveSettings();
    });
    
    // 表单控件变更事件
    document.querySelectorAll('select, input').forEach(control => {
        control.addEventListener('change', saveSettings);
    });
}

/**
 * 更新滑块填充色
 * @param {HTMLInputElement} slider - 滑块元素
 */
function updateSliderFill(slider) {
    const min = slider.min || 0;
    const max = slider.max || 100;
    const value = slider.value || 0;
    
    // 计算填充百分比
    const percentage = ((value - min) / (max - min)) * 100;
    
    // 设置背景尺寸来创建填充效果
    slider.style.backgroundSize = `${percentage}% 100%`;
}

// 初始化滑块样式
function initSliders() {
    // 初始化所有滑块的填充样式
    const sliders = document.querySelectorAll('input[type="range"].setting-control');
    sliders.forEach(slider => {
        updateSliderFill(slider);
        
        // 添加事件监听器确保值变化时更新填充
        slider.addEventListener('input', () => {
            updateSliderFill(slider);
        });
    });
}

// 返回按钮点击事件
backButton.addEventListener('click', () => {
    // 保存设置
    saveSettings();
    
    // 停止设置页面的预览（不影响主窗口的视频流）
    if (cameraStream && cameraStream !== window.mainWindow?.currentStream) {
        stopCameraPreview();
    }
    
    console.log('返回按钮被点击，返回主界面');
    
    try {
        // 通知主窗口（仅更新UI状态，不重新初始化相机）
        if (window.mainWindow) {
            // 仅发送UI更新事件
            window.mainWindow.dispatchEvent(new Event('ui_updated'));
            
            // 确保主窗口可见
            nw.Window.get(window.mainWindow).show();
            nw.Window.get(window.mainWindow).focus();
            
            // 关闭设置窗口
            nw.Window.get().close();
        } else {
            console.error('找不到主窗口引用');
            // 尝试通过window.opener获取主窗口
            if (window.opener) {
                window.opener.dispatchEvent(new Event('ui_updated'));
                nw.Window.get().close();
            } else {
                showNotification('无法返回主界面', true);
            }
        }
    } catch (err) {
        console.error('返回主界面时出错:', err);
        showNotification('返回主界面时出错', true);
    }
});

// 窗口关闭前清理相机预览
window.addEventListener('beforeunload', () => {
    stopCameraPreview();
});

// 最小化按钮点击事件
if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
        win.minimize();
    });
}

// 显示通知
function showNotification(message, isError = false) {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = 'notification';
    if (isError) {
        notification.style.backgroundColor = 'rgba(220, 53, 69, 0.9)';
    }
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 动画显示
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // 设置自动消失
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    // Esc键返回
    if (e.code === 'Escape') {
        backButton.click();
    }
});

// 初始化
init(); 