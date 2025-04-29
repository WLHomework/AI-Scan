// 获取 NW.js 窗口对象
var gui = require('nw.gui');
var win = gui.Window.get();

win.show();

// 调试面板相关变量
let debugPanelEnabled = false;
let debugPanel = null;
let debugMessages = [];
let maxDebugMessages = 100;
let originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info
};

// DOM 元素
const preview = document.getElementById('preview');
const photoCanvas = document.getElementById('photo-canvas');
const captureBtn = document.getElementById('capture-btn');
const switchCameraBtn = document.getElementById('switch-camera');
const rotateBtn = document.getElementById('rotate-btn');
const modeBtns = document.querySelectorAll('.mode-btn');
const minimizeBtn = document.querySelector('.minimize-btn');
const closeBtn = document.querySelector('.close-btn');
const settingsBtn = document.getElementById('settings-button');
const galleryBtn = document.querySelector('.gallery-btn');
const timerBtn = document.querySelector('.timer-btn');
const gridBtn = document.querySelector('.grid-btn');
const toggleProcessingBtn = document.getElementById('toggle-processing-btn');
const processedCanvas = document.getElementById('processed-preview');

// 创建隐藏的canvas用于图像处理
const hiddenCanvas = document.createElement('canvas');
hiddenCanvas.style.position = 'absolute';
hiddenCanvas.style.top = '0';
hiddenCanvas.style.left = '0';
hiddenCanvas.style.width = '100%';
hiddenCanvas.style.height = '100%';
hiddenCanvas.style.objectFit = 'contain';
hiddenCanvas.style.display = 'none';
hiddenCanvas.style.zIndex = '0';
const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });

// 调试代码 - 检查是否正确获取到设置按钮
console.log('设置按钮元素 (通过ID):', settingsBtn);
if (!settingsBtn) {
    console.error('未能找到设置按钮元素 (.settings-btn)');
    // 尝试其他可能的选择器
    const alternativeBtn = document.querySelector('.sidebar-btn');
    console.log('备选设置按钮 (.sidebar-btn):', alternativeBtn);
}

// 确保在DOM加载完成后绑定事件
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM已加载，重新获取设置按钮');
    const domLoadedSettingsBtn = document.querySelector('.settings-btn');
    console.log('DOM加载后的设置按钮:', domLoadedSettingsBtn);
    
    if (domLoadedSettingsBtn) {
        domLoadedSettingsBtn.addEventListener('click', openSettings);
    }

    // 切换图像处理按钮
    if (toggleProcessingBtn) {
        toggleProcessingBtn.addEventListener('click', toggleProcessing);
    }

    // 初始化计时器按钮
    if (timerBtn) {
        // 确保初始图标为timer
        timerBtn.querySelector('.material-symbols-outlined').textContent = 'timer';
        timerBtn.addEventListener('click', cycleTimer);
    }

    // 在初始化时将hiddenCanvas添加到preview的父元素中
    const previewContainer = preview.parentElement;
    if (previewContainer) {
        previewContainer.style.position = 'relative';
        
        // 确保preview在canvas下方
        preview.style.zIndex = '0';
        
        // 将canvas添加到容器中
        previewContainer.insertBefore(hiddenCanvas, previewContainer.firstChild);
    }
});

// 状态变量
let currentMode = 'photo'; // 默认为拍照模式
let mediaRecorder = null;
let recordedChunks = [];
let currentStream = null;
let isGridVisible = false;
let currentTimer = 0; // 0 = off, 3 = 3s, 10 = 10s
let currentRotation = 0; // 当前旋转角度: 0, 90, 180, 270
let currentZoom = 1.0; // 当前缩放比例
let isDragging = false; // 是否正在拖动
let dragStartX = 0; // 拖动开始X坐标
let dragStartY = 0; // 拖动开始Y坐标
let translateX = 0; // X轴平移量
let translateY = 0; // Y轴平移量
let cv = null; // OpenCV.js 实例
let processedCtx = null;
let isOpenCvReady = false;
let processingEnabled = false; // 控制是否启用图像处理
let imageProcessor = null; // Added for ImageProcessor

// 添加状态跟踪变量
let previousProcessingState = null;
let previousOpenCvState = null;
let previousStreamState = null;

// 应用程序设置
let appSettings = {
    camera: {
        device: 'default',
        resolution: '2.1MP 16:9',
        framerate: '30',
        mirror: true,
        sound: true,
        flash: true
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
    },
    scan: {
        qrCode: true,
        barcode: true,
        document: true,
        autoEnhance: true,
        autoCrop: true
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

// 存储可用的相机设备
let availableCameras = [];
let currentCameraIndex = 0;

// 获取所有可用的相机设备
async function getAvailableCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter(device => device.kind === 'videoinput');
        console.log('可用相机设备:', availableCameras);
        
        // 更新切换相机按钮的状态
        updateSwitchCameraButton();
    } catch (error) {
        console.error('获取相机设备列表失败:', error);
        showNotification('无法获取相机设备列表');
    }
}

// 更新切换相机按钮的状态
function updateSwitchCameraButton() {
    if (switchCameraBtn) {
        if (availableCameras.length <= 1) {
            // 如果只有一个或没有相机，禁用按钮并添加特殊样式
            switchCameraBtn.disabled = true;
            switchCameraBtn.style.opacity = '0.5';
            switchCameraBtn.style.cursor = 'not-allowed';
            // 添加提示信息
            switchCameraBtn.title = '没有其他可用的相机设备';
        } else {
            // 有多个相机时启用按钮
            switchCameraBtn.disabled = false;
            switchCameraBtn.style.opacity = '1';
            switchCameraBtn.style.cursor = 'pointer';
            switchCameraBtn.title = '切换相机';
        }
    }
}

// 切换相机
async function switchCamera() {
    if (availableCameras.length <= 1) {
        showNotification('没有其他可用的相机设备');
        return;
    }

    try {
        // 停止当前视频流
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        // 切换到下一个相机
        currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
        const newCamera = availableCameras[currentCameraIndex];

        // 获取配置的约束
        const baseConstraints = buildConstraints();
        
        // 确保使用选定的相机
        const constraints = {
            video: {
                ...baseConstraints.video,
                deviceId: { exact: newCamera.deviceId }
            },
            audio: baseConstraints.audio
        };

        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        preview.srcObject = currentStream;
        
        // 显示切换成功提示
        showNotification('已切换到' + (newCamera.label || '相机 ' + (currentCameraIndex + 1)));

    } catch (error) {
        console.error('切换相机失败:', error);
        showNotification('切换相机失败，请重试');
        
        // 尝试回退到之前的相机
        currentCameraIndex = (currentCameraIndex - 1 + availableCameras.length) % availableCameras.length;
        tryRestorePreviousCamera();
    }
}

// 尝试恢复之前的相机
async function tryRestorePreviousCamera() {
    try {
        const previousCamera = availableCameras[currentCameraIndex];
        
        // 获取配置的约束
        const baseConstraints = buildConstraints();
        
        // 确保使用选定的相机
        const constraints = {
            video: {
                ...baseConstraints.video,
                deviceId: { exact: previousCamera.deviceId }
            },
            audio: baseConstraints.audio
        };
        
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        preview.srcObject = currentStream;
    } catch (error) {
        console.error('恢复之前的相机失败:', error);
        showNotification('相机切换失败，请检查相机连接');
    }
}

// 添加OpenCV初始化和图像处理相关函数
document.addEventListener('opencv_ready', () => {
    console.log('OpenCV.js 已加载完成');
    cv = window.cv;
    isOpenCvReady = true;
    // processedCanvas = document.getElementById('processed-preview');
    processedCtx = processedCanvas.getContext('2d', { willReadFrequently: true });
    
    // 显示处理后的canvas
    processedCanvas.style.display = 'none'; // 初始状态设为隐藏
    preview.style.display = 'block'; // 初始状态显示原始视频
    processingEnabled = false; // 初始状态关闭处理
    
    // 更新切换处理按钮状态
    updateProcessingButtonState();
    
    // 如果已经有视频流，开始处理
    if (currentStream) {
        startVideoProcessing();
    }
});

// 添加OpenCV加载错误处理
function onOpenCvError() {
    console.error('OpenCV.js 加载失败');
    showNotification('OpenCV.js 加载失败，图像处理功能不可用', 5000);
}

// 添加OpenCV加载成功处理
function onOpenCvReady() {
    console.log('OpenCV.js 加载成功');
    document.dispatchEvent(new Event('opencv_ready'));
}

// 添加帧率控制
const targetFPS = 15; // 目标帧率
const frameInterval = 1000 / targetFPS;
let lastFrameTime = 0;
let processingFrame = false;

// 处理视频帧
function processFrame() {
    // 检测状态变化并只在变化时输出日志
    const currentOpenCvState = isOpenCvReady;
    const currentProcessingState = processingEnabled;
    const currentStreamState = !!currentStream;
    
    // 只在状态首次检测或发生变化时输出日志
    if (previousOpenCvState !== currentOpenCvState) {
        if (!currentOpenCvState) {
            console.log('OpenCV.js尚未加载完成');
        } else {
            console.log('OpenCV.js已准备就绪');
        }
        previousOpenCvState = currentOpenCvState;
    }
    
    if (previousProcessingState !== currentProcessingState) {
        if (!currentProcessingState) {
            console.log('图像处理已禁用');
        } else {
            console.log('图像处理已启用');
        }
        previousProcessingState = currentProcessingState;
    }
    
    if (previousStreamState !== currentStreamState) {
        if (!currentStreamState) {
            console.log('没有活动的视频流');
        } else {
            console.log('视频流已连接');
        }
        previousStreamState = currentStreamState;
    }
    
    // 如果条件不满足，继续下一帧处理
    if (!isOpenCvReady || !processingEnabled || !currentStream) {
        requestAnimationFrame(processFrame);
        return;
    }

    // 帧率控制
    const currentTime = performance.now();
    if (currentTime - lastFrameTime < frameInterval) {
        requestAnimationFrame(processFrame);
        return;
    }

    // 如果正在处理上一帧，跳过这一帧
    if (processingFrame) {
        requestAnimationFrame(processFrame);
        return;
    }

    processingFrame = true;
    lastFrameTime = currentTime;

    try {
        // 设置canvas尺寸与视频相同
        hiddenCanvas.width = preview.videoWidth;
        hiddenCanvas.height = preview.videoHeight;
        
        // 将视频帧绘制到canvas
        hiddenCtx.drawImage(preview, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
        
        // 创建源图像的Mat对象
        let src = cv.imread(hiddenCanvas);
        if (!src || src.empty()) {
            if (src) src.delete();
            processingFrame = false;
            requestAnimationFrame(processFrame);
            return;
        }
        
        // 检查ImageProcessor是否已初始化并运行
        if (!imageProcessor || !imageProcessor.isRunning) {
            console.log('正在初始化ImageProcessor...');
            try {
                if (imageProcessor) {
                    imageProcessor.stop();
                }
                imageProcessor = new ImageProcessor();
                imageProcessor.start();
                console.log('ImageProcessor初始化成功，isRunning:', imageProcessor.isRunning);
            } catch (err) {
                console.error('初始化ImageProcessor失败:', err);
                processingEnabled = false;
                updateProcessingButtonState();
                showNotification('图像处理器初始化失败，请刷新页面重试');
                if (src) src.delete();
                processingFrame = false;
                return;
            }
        }
        
        // 处理图像
        const result = imageProcessor.processFrame(src);
        
        if (result && result.original && !result.original.empty()) {
            // 确保processedCanvas尺寸正确
            processedCanvas.width = result.original.cols;
            processedCanvas.height = result.original.rows;
            
            // 显示处理后的图像到processedCanvas
            cv.imshow(processedCanvas, result.original);
            
            // 更新显示状态
            preview.style.visibility = 'hidden';
            preview.style.display = 'none';
            processedCanvas.style.visibility = 'visible';
            processedCanvas.style.display = 'block';
            
            // 释放内存
            result.original.delete();
            if (result.transformed) result.transformed.delete();
        }
        
        // 释放源图像内存
        src.delete();
        
        // 继续处理下一帧
        if (processingEnabled) {
            requestAnimationFrame(processFrame);
        }
    } catch (err) {
        console.error('Error in processFrame:', err);
        processingEnabled = false;
        updateProcessingButtonState();
        showNotification('处理视频帧时出错：' + err.message);
    } finally {
        processingFrame = false;
    }
}

// 开始视频处理
function startVideoProcessing() {
    if (!currentStream) {
        console.error('没有活动的视频流');
        return;
    }

    // 重置状态
    lastFrameTime = 0;
    processingFrame = false;
    
    // 开始处理视频帧
    processFrame();
}

// 停止视频处理
function stopVideoProcessing() {
    processingEnabled = false;
    if (imageProcessor) {
        imageProcessor.stop();
    }
    
    // 确保视频预览元素可见
    if (preview) {
        preview.style.visibility = 'visible';
        preview.style.display = 'block';
    }
    
    // 隐藏处理用的canvas
    if (processedCanvas) {
        processedCanvas.style.visibility = 'hidden';
        processedCanvas.style.display = 'none';
    }
    
    if (hiddenCanvas) {
        hiddenCanvas.style.visibility = 'hidden';
        hiddenCanvas.style.display = 'none';
    }
    
    // 使用 applyTransform 重新应用正确的变换，而不是直接重置
    applyTransform();
    
    console.log('已停止视频处理，并恢复视频位置和样式');
}

// 添加专门的镜像设置更新函数，供设置窗口调用
function updateMirrorSetting(isMirrored) {
    console.log('从设置窗口直接调用镜像设置更新函数:', isMirrored);
    
    try {
        // 更新设置
        appSettings.camera.mirror = isMirrored;
        
        // 应用镜像和旋转设置
        applyTransform();
        
        // 保存设置到本地存储
        localStorage.setItem('cameraAppSettings', JSON.stringify(appSettings));
        
        // 触发更新事件
        window.dispatchEvent(new Event('mirror_updated'));
        
        console.log('镜像设置已通过直接调用更新:', isMirrored ? '已开启' : '已关闭');
        return true;
    } catch (err) {
        console.error('直接应用镜像设置时出错:', err);
        return false;
    }
}

// 初始化
async function init() {
    // 加载保存的设置
    loadSettings();
    
    try {
        // 首先检查是否支持mediaDevices API
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('浏览器不支持访问摄像头');
        }

        // 检查是否有可用的视频输入设备
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        if (videoDevices.length === 0) {
            throw new Error('未检测到摄像头设备');
        }
        
        console.log('检测到的视频设备:', videoDevices);
        
        // 检测虚拟摄像头
        const virtualCameraKeywords = [
            'screen', 'capture', 'plug-in', 'plugin', 'virtual', 
            'corel', 'obs', 'droidcam', 'iriun', 'ndi', 
            'snap', 'xsplit', 'manycam', 'camtwist', 'epoccam'
        ];
        
        // 检查设备是否为虚拟摄像头
        function isLikelyVirtualCamera(deviceLabel) {
            if (!deviceLabel) return false;
            const lowerLabel = deviceLabel.toLowerCase();
            return virtualCameraKeywords.some(keyword => lowerLabel.includes(keyword.toLowerCase()));
        }
        
        // 分析当前设置中选择的摄像头
        let currentDeviceIsVirtual = false;
        if (appSettings.camera.device && appSettings.camera.device !== 'default') {
            const currentDevice = videoDevices.find(d => d.deviceId === appSettings.camera.device);
            if (currentDevice && currentDevice.label) {
                currentDeviceIsVirtual = isLikelyVirtualCamera(currentDevice.label);
                if (currentDeviceIsVirtual) {
                    console.log('当前选择的是虚拟摄像头:', currentDevice.label);
                }
            }
        }

        try {
            // 尝试使用不同的方式初始化摄像头
            console.log('尝试初始化摄像头...');
            
            // 获取基于当前设置的媒体约束
            const constraints = buildConstraints();
            console.log('使用媒体约束:', constraints);
            
            // 方法1: 使用设置的约束
            try {
                console.log('方法1: 使用设置的约束');
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                console.log('方法1成功: 使用设置的约束初始化摄像头');
                
                // 如果成功初始化且使用的是虚拟摄像头，显示提示
                if (currentDeviceIsVirtual) {
                    showNotification('您正在使用虚拟摄像头，某些功能可能受限', 5000);
                }
            } catch (method1Error) {
                console.error('方法1失败:', method1Error);
                
                // 方法2: 使用低分辨率
                try {
                    console.log('方法2: 使用低分辨率');
                    currentStream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 640 },
                            height: { ideal: 480 }
                        },
                        audio: false
                    });
                    console.log('方法2成功: 使用低分辨率初始化摄像头');
                } catch (method2Error) {
                    console.error('方法2失败:', method2Error);
                    
                    // 方法3: 使用特定设备ID
                    try {
                        console.log('方法3: 使用特定设备ID');
                        const deviceId = videoDevices[0].deviceId;
                        currentStream = await navigator.mediaDevices.getUserMedia({
                            video: {
                                deviceId: { exact: deviceId }
                            },
                            audio: false
                        });
                        console.log('方法3成功: 使用特定设备ID初始化摄像头');
                    } catch (method3Error) {
                        console.error('方法3失败:', method3Error);
                        throw new Error('所有初始化方法都失败: ' + method3Error.message);
                    }
                }
            }

            // 设置预览
            preview.srcObject = currentStream;
            console.log('成功设置预览源');
            
            // 应用镜像和旋转设置
            applyTransform();
            
            // 初始化ImageProcessor
            if (typeof ImageProcessor !== 'undefined') {
                imageProcessor = new ImageProcessor();
                console.log('ImageProcessor initialized successfully');
                
                // 开始视频处理
                startVideoProcessing();
            } else {
                console.error('ImageProcessor未定义，请确保已正确加载image-processor.js');
                showNotification('图像处理器未加载，请刷新页面重试');
            }
            
        } catch (err) {
            console.error('初始化摄像头失败:', err);
            showNotification('初始化摄像头失败: ' + err.message);
            
            // 尝试提供更详细的错误信息
            if (err.name === 'NotAllowedError') {
                showNotification('摄像头访问被拒绝，请检查系统权限设置');
                console.error('权限错误详情:', err);
                
                // 尝试提供更多帮助信息
                const helpMessage = `
                    摄像头访问被拒绝，可能的原因：
                    1. 系统权限设置阻止了应用访问摄像头
                    2. 其他应用正在使用摄像头
                    3. 摄像头被禁用或未正确连接
                    
                    解决方法：
                    1. 检查系统设置中的摄像头权限
                    2. 关闭其他可能使用摄像头的应用
                    3. 重新连接摄像头或重启应用
                `;
                console.log(helpMessage);
            } else if (err.name === 'NotFoundError') {
                showNotification('未找到摄像头设备，请确保设备已连接');
            } else if (err.name === 'NotReadableError') {
                showNotification('摄像头被其他应用程序占用，请关闭其他使用摄像头的应用');
            } else if (err.name === 'OverconstrainedError') {
                showNotification('摄像头不支持请求的分辨率，请尝试降低分辨率');
            } else if (err.name === 'TypeError') {
                showNotification('摄像头API错误，请检查浏览器兼容性');
            }
        }
    } catch (err) {
        console.error('初始化失败:', err);
        showNotification('初始化失败: ' + err.message);
    }
}

// 加载设置
function loadSettings() {
    // 尝试从存储中加载
    const savedSettings = localStorage.getItem('cameraAppSettings');
    if (savedSettings) {
        try {
            appSettings = JSON.parse(savedSettings);
            
            // 应用镜像和旋转设置
            // 注意：这里只更新appSettings，实际应用会在视频初始化后通过applyTransform函数完成
            console.log('从存储加载设置，包含镜像设置:', appSettings.camera.mirror);
        } catch (err) {
            console.error('Error parsing saved settings:', err);
        }
    }
}

// 根据设置构建媒体约束
function buildConstraints() {
    // 获取分辨率设置
    const resolution = resolutionMap[appSettings.camera.resolution] || resolutionMap['0.9MP 16:9'];
    
    // 基础视频约束
    const videoConstraints = {
        width: { ideal: resolution.width },
        height: { ideal: resolution.height },
        frameRate: { ideal: parseInt(appSettings.camera.framerate) || 30 }
    };
    
    // 如果指定了设备，添加设备ID
    if (appSettings.camera.device && appSettings.camera.device !== 'default') {
        videoConstraints.deviceId = { exact: appSettings.camera.device };
    }
    
    return {
        video: videoConstraints,
        audio: appSettings.video.audio
    };
}

// 显示通知
function showNotification(message, duration = 3000) {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = 'notification';
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
    }, duration);
}

// 更新按钮状态
function updateButtonStates() {
    // 更新模式按钮状态
    modeBtns.forEach(btn => {
        const mode = btn.getAttribute('data-mode');
        if (mode === currentMode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 更新网格按钮状态
    if (isGridVisible) {
        gridBtn.classList.add('active');
    } else {
        gridBtn.classList.remove('active');
    }
    
    // 更新计时器按钮状态
    if (currentTimer > 0) {
        timerBtn.classList.add('active');
    } else {
        timerBtn.classList.remove('active');
    }
    
    // 更新旋转按钮状态
    if (currentRotation > 0) {
        rotateBtn.classList.add('active');
        // 更新旋转按钮的提示信息
        rotateBtn.setAttribute('title', `旋转画面 (当前: ${currentRotation}°)`);
    } else {
        rotateBtn.classList.remove('active');
        rotateBtn.setAttribute('title', '旋转画面');
    }
    
    // 更新图像处理按钮状态
    updateProcessingButtonState();
}

// 更新图像处理按钮状态
function updateProcessingButtonState() {
    if (!toggleProcessingBtn) return;
    
    if (processingEnabled) {
        toggleProcessingBtn.classList.add('active');
        toggleProcessingBtn.title = '关闭图像处理';
    } else {
        toggleProcessingBtn.classList.remove('active');
        toggleProcessingBtn.title = '开启图像处理';
    }
}

// 切换图像处理
function toggleProcessing() {
    processingEnabled = !processingEnabled;
    updateProcessingButtonState();
    
    if (processingEnabled) {
        console.log('正在开启图像处理...');
        
        if (!isOpenCvReady) {
            console.error('OpenCV.js尚未加载完成，无法开启图像处理');
            showNotification('OpenCV.js尚未加载完成，无法开启图像处理');
            processingEnabled = false;
            updateProcessingButtonState();
            return;
        }
        
        try {
            // 确保hiddenCanvas准备就绪
            if (!hiddenCanvas.width || !hiddenCanvas.height) {
                hiddenCanvas.width = preview.videoWidth;
                hiddenCanvas.height = preview.videoHeight;
            }
            
            // 设置处理后画布的显示状态，复制预览视频的所有样式
            if (processedCanvas) {
                // 确保处理画布可见并正确显示
                processedCanvas.style.visibility = 'visible';
                processedCanvas.style.display = 'block';
                
                // 应用与视频相同的变换和样式
                processedCanvas.style.position = preview.style.position;
                processedCanvas.style.top = preview.style.top;
                processedCanvas.style.left = preview.style.left;
                processedCanvas.style.width = preview.style.width;
                processedCanvas.style.height = preview.style.height;
                processedCanvas.style.maxWidth = preview.style.maxWidth;
                processedCanvas.style.maxHeight = preview.style.maxHeight;
                processedCanvas.style.transform = preview.style.transform;
            }
            
            // 隐藏原始视频预览
            preview.style.visibility = 'hidden';
            preview.style.display = 'none';
            
            // 重置hiddenCanvas的显示状态
            hiddenCanvas.style.visibility = 'visible';
            hiddenCanvas.style.display = 'block';
            
            // 初始化或重新初始化ImageProcessor
            if (!imageProcessor || !imageProcessor.isRunning) {
                imageProcessor = new ImageProcessor();
            }
            imageProcessor.start();
            
            // 开始处理视频帧
            startVideoProcessing();
            
            // 应用变换
            applyTransform();
            
            showNotification('图像处理已开启');
            
        } catch (err) {
            console.error('初始化ImageProcessor失败:', err);
            showNotification('图像处理器初始化失败，请刷新页面重试');
            processingEnabled = false;
            updateProcessingButtonState();
            
            // 恢复原始视频显示
            preview.style.visibility = 'visible';
            preview.style.display = 'block';
            if (processedCanvas) {
                processedCanvas.style.visibility = 'hidden';
                processedCanvas.style.display = 'none';
            }
            hiddenCanvas.style.display = 'none';
        }
    } else {
        console.log('正在关闭图像处理...');
        stopVideoProcessing();
        showNotification('图像处理已关闭');
    }
}

// 切换网格显示
function toggleGrid() {
    isGridVisible = !isGridVisible;
    
    // 如果已有网格，移除它
    const existingGrid = document.querySelector('.camera-grid');
    if (existingGrid) {
        existingGrid.remove();
    }
    
    // 如果需要显示网格，创建并添加
    if (isGridVisible) {
        const grid = document.createElement('div');
        grid.className = 'camera-grid';
        document.querySelector('.preview-area').appendChild(grid);
    }
    
    updateButtonStates();
}

// 切换计时器
function cycleTimer() {
    // 循环切换计时器时间：0 -> 3 -> 10 -> 0
    if (currentTimer === 0) {
        currentTimer = 3;
        timerBtn.setAttribute('data-time', '3');
        timerBtn.querySelector('.material-symbols-outlined').textContent = '3';
    } else if (currentTimer === 3) {
        currentTimer = 10;
        timerBtn.setAttribute('data-time', '10');
        timerBtn.querySelector('.material-symbols-outlined').textContent = '10';
    } else {
        currentTimer = 0;
        timerBtn.removeAttribute('data-time');
        timerBtn.querySelector('.material-symbols-outlined').textContent = 'timer';
    }
    
    // 更新按钮状态
    timerBtn.classList.toggle('active', currentTimer > 0);
    
    // 显示提示信息
    if (currentTimer > 0) {
        showNotification(`计时器已设置为 ${currentTimer} 秒`);
    } else {
        showNotification('计时器已关闭');
    }
}

// 模式切换
modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode === currentMode) return;

        // 更新模式切换器的状态
        document.querySelector('.mode-switch').dataset.mode = mode;
        
        // 添加切换动画
        const previewArea = document.querySelector('.preview-area');
        previewArea.classList.add('switching');
        
        // 重置录制状态
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        captureBtn.classList.remove('recording');
        
        // 延迟更新当前模式，等待动画完成
        setTimeout(() => {
            // 更新当前模式
            currentMode = mode;
            
            // 更新界面
            updateButtonStates();
            
            // 移除切换动画类
            previewArea.classList.remove('switching');
            
            // 显示模式切换通知
            showNotification(`模式: ${getModeName(currentMode)}`);
        }, 300); // 与 CSS 动画时长匹配
    });
});

// 初始化模式切换器状态
document.addEventListener('DOMContentLoaded', () => {
    // 设置初始模式
    document.querySelector('.mode-switch').dataset.mode = currentMode;
    
    // 为每个模式按钮添加 data-mode 属性，并设置正确的激活状态
    modeBtns.forEach(btn => {
        btn.setAttribute('data-mode', btn.getAttribute('data-mode'));
        
        // 确保照片模式按钮被选中为激活状态，视频模式按钮不被选中
        if(btn.getAttribute('data-mode') === 'photo') {
            btn.classList.add('active');
        } else if(btn.getAttribute('data-mode') === 'video') {
            btn.classList.remove('active');
        }
    });
});

// 获取模式名称
function getModeName(mode) {
    switch(mode) {
        case 'photo': return '照片';
        case 'video': return '视频';
        case 'scan': return '扫描';
        default: return mode;
    }
}

// 拍照功能
async function takePhoto() {
    // 如果设置了计时器，等待倒计时
    if (currentTimer > 0) {
        await countDown(currentTimer);
    }
    
    // 拍照动画
    if (appSettings.camera.flash) {
        animateCapture();
    }
    
    // 播放音效
    if (appSettings.camera.sound) {
        playSound('camera-shutter');
    }
    
    // 拍照逻辑
    const context = photoCanvas.getContext('2d');
    photoCanvas.width = preview.videoWidth;
    photoCanvas.height = preview.videoHeight;
    
    // 处理镜像问题
    // if (appSettings.camera.mirror) {
    //     context.translate(photoCanvas.width, 0);
    //     context.scale(-1, 1);
    // }
    
    context.drawImage(preview, 0, 0, photoCanvas.width, photoCanvas.height);
    
    try {
        // 获取图片格式和质量
        const format = appSettings.photo.format;
        const quality = format === 'jpeg' ? appSettings.photo.jpegQuality / 100 : 1;
        const mimeType = `image/${format}`;
        
        // 生成图片数据
        const imageData = photoCanvas.toDataURL(mimeType, quality);
        
        // 更新缩略图
        updateThumbnail(imageData);
        
        if (appSettings.photo.autoSave) {
            // 自动保存模式
            try {
                // 创建 Blob
                const blob = await (await fetch(imageData)).blob();
                
                // 构建完整的保存路径
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `photo_${timestamp}.${format}`;
                let savePath = appSettings.photo.savePath;
                
                // 如果路径是相对路径，转换为绝对路径
                if (!savePath.includes(':')) {
                    savePath = nw.App.dataPath + '/' + savePath;
                }
                
                // 确保目录存在
                const fs = require('fs');
                if (!fs.existsSync(savePath)) {
                    fs.mkdirSync(savePath, { recursive: true });
                }
                
                // 保存文件
                const fullPath = `${savePath}/${filename}`;
                fs.writeFileSync(fullPath, Buffer.from(await blob.arrayBuffer()));
                
                showNotification(`照片已保存至 ${fullPath}`);
            } catch (err) {
                console.error('自动保存照片失败:', err);
                showNotification('自动保存照片失败，请检查保存路径设置', true);
            }
        } else {
            // 手动保存模式 - 打开保存对话框
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const suggestedName = `photo_${timestamp}.${format}`;
            
            // 创建保存对话框
            const saveDialog = document.createElement('input');
            saveDialog.type = 'file';
            saveDialog.nwsaveas = suggestedName;
            saveDialog.accept = `.${format}`;
            
            // 监听文件选择
            saveDialog.addEventListener('change', async (e) => {
                if (saveDialog.value) {
                    try {
                        // 创建 Blob 并保存
                        const blob = await (await fetch(imageData)).blob();
                        const fs = require('fs');
                        fs.writeFileSync(saveDialog.value, Buffer.from(await blob.arrayBuffer()));
                        showNotification('照片已保存');
                    } catch (err) {
                        console.error('保存照片失败:', err);
                        showNotification('保存照片失败', true);
                    }
                }
            });
            
            // 打开保存对话框
            saveDialog.click();
        }
    } catch (err) {
        console.error('处理照片失败:', err);
        showNotification('处理照片失败', true);
    }
}

// 播放音效
function playSound(soundName) {
    // 在实际应用中，这里应该播放声音文件
    console.log(`播放音效: ${soundName}`);
    
    // 简单实现，仅供演示
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.value = 800;
    gainNode.gain.value = 0.1;
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.start();
    setTimeout(() => {
        oscillator.stop();
    }, 150);
}

// 倒计时
function countDown(seconds) {
    return new Promise(resolve => {
        let remaining = seconds;
        
        // 创建倒计时元素
        const countDownEl = document.createElement('div');
        countDownEl.className = 'countdown';
        countDownEl.textContent = remaining;
        document.querySelector('.preview-area').appendChild(countDownEl);
        
        const interval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(interval);
                countDownEl.remove();
                resolve();
            } else {
                countDownEl.textContent = remaining;
            }
        }, 1000);
    });
}

// 拍照动画
function animateCapture() {
    const flash = document.createElement('div');
    flash.className = 'camera-flash';
    document.querySelector('.preview-area').appendChild(flash);
    
    setTimeout(() => {
        flash.remove();
    }, 500);
}

// 录像功能
async function handleVideoCapture() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        // 如果设置了计时器，等待倒计时
        if (currentTimer > 0) {
            await countDown(currentTimer);
        }
        
        // 开始录制
        recordedChunks = [];
        
        // 根据设置选择合适的MIME类型和比特率
        const mimeType = appSettings.video.format === 'webm' ? 'video/webm' : 'video/mp4';
        const bitrate = appSettings.video.bitrate * 1000000; // 转换为比特每秒
        
        const options = {
            mimeType: `${mimeType};codecs=vp9`,
            videoBitsPerSecond: bitrate
        };
        
        mediaRecorder = new MediaRecorder(currentStream, options);
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const extension = appSettings.video.format === 'webm' ? 'webm' : 'mp4';
            link.download = `video_${Date.now()}.${extension}`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
            
            // 更新缩略图
            createVideoThumbnail(blob);
            
            showNotification('视频已保存');
        };

        mediaRecorder.start();
        captureBtn.classList.add('recording');
        showNotification('开始录制');
    } else {
        // 停止录制
        mediaRecorder.stop();
        captureBtn.classList.remove('recording');
        showNotification('录制已停止');
    }
}

// 扫描功能
async function handleScan() {
    try {
        // 如果设置了计时器，等待倒计时
        if (currentTimer > 0) {
            await countDown(currentTimer);
        }
        
        // 拍照动画
        if (appSettings.camera.flash) {
            animateCapture();
        }
        
        // 播放音效
        if (appSettings.camera.sound) {
            playSound('camera-shutter');
        }
        
        // 获取当前视频帧
        const video = document.getElementById('preview');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // 创建OpenCV的Mat对象
        const src = cv.imread(canvas);
        
        // 确保ImageProcessor存在并可用于扫描，无论全局图像处理是否启用
        let wasProcessingInitialized = false;
        let previousProcessingState = processingEnabled;
        let scanResult = null;
        
        try {
            // 检查ImageProcessor状态
            if (!imageProcessor || !imageProcessor.isRunning) {
                console.log('扫描模式：初始化ImageProcessor用于一次性处理');
                wasProcessingInitialized = true;
                
                // 初始化或重新初始化ImageProcessor
                if (!imageProcessor) {
                    imageProcessor = new ImageProcessor();
                }
                
                // 仅为此次扫描启动处理器
                imageProcessor.start();
            }
            
            // 处理帧，获取透视变换结果
            scanResult = imageProcessor.processFrame(src);
            
            // 如果是临时初始化的，完成后停止处理器
            if (wasProcessingInitialized) {
                console.log('扫描完成，停止临时处理器');
                imageProcessor.stop();
            }
        } catch (procError) {
            console.error('扫描过程中处理图像失败:', procError);
            
            // 确保清理资源
            if (wasProcessingInitialized && imageProcessor) {
                imageProcessor.stop();
            }
            
            throw procError; // 重新抛出错误继续处理
        }
        
        if (scanResult && scanResult.transformed && !scanResult.transformed.empty()) {
            // 创建结果canvas
            const resultCanvas = document.createElement('canvas');
            resultCanvas.width = scanResult.transformed.cols;
            resultCanvas.height = scanResult.transformed.rows;
            
            // 显示结果
            cv.imshow(resultCanvas, scanResult.transformed);
            
            // 获取图片格式和质量
            const format = appSettings.photo.format;
            const quality = format === 'jpeg' ? appSettings.photo.jpegQuality / 100 : 1;
            const mimeType = `image/${format}`;
            
            // 生成图片数据
            const imageData = resultCanvas.toDataURL(mimeType, quality);
            
            // 更新缩略图
            updateThumbnail(imageData);
            
            // 扫描模式下始终自动保存图像，不考虑appSettings.photo.autoSave设置
            try {
                // 创建 Blob
                const blob = await (await fetch(imageData)).blob();
                
                // 构建完整的保存路径
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `scan_${timestamp}.${format}`;
                let savePath = appSettings.photo.savePath;
                
                // 如果路径是相对路径，转换为绝对路径
                if (!savePath.includes(':')) {
                    savePath = nw.App.dataPath + '/' + savePath;
                }
                
                // 确保目录存在
                const fs = require('fs');
                if (!fs.existsSync(savePath)) {
                    fs.mkdirSync(savePath, { recursive: true });
                }
                
                // 保存文件
                const fullPath = `${savePath}/${filename}`;
                fs.writeFileSync(fullPath, Buffer.from(await blob.arrayBuffer()));
                
                showNotification(`扫描结果已保存至 ${fullPath}`);
            } catch (err) {
                console.error('自动保存扫描结果失败:', err);
                showNotification('自动保存扫描结果失败，请检查保存路径设置', true);
            }
        } else {
            showNotification('未检测到有效边界，请调整拍摄角度');
        }
        
        // 释放内存
        src.delete();
        if (scanResult) {
            if (scanResult.original) scanResult.original.delete();
            if (scanResult.transformed) scanResult.transformed.delete();
        }
    } catch (error) {
        console.error('扫描失败:', error);
        showNotification('扫描失败: ' + error.message);
    }
}

// 更新缩略图
function updateThumbnail(dataUrl) {
    const thumbnail = document.querySelector('.thumbnail');
    thumbnail.style.backgroundImage = `url(${dataUrl})`;
    thumbnail.style.backgroundSize = 'cover';
    thumbnail.style.backgroundPosition = 'center';
}

// 创建视频缩略图
function createVideoThumbnail(videoBlob) {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoBlob);
    
    video.addEventListener('loadeddata', () => {
        video.currentTime = 0;
    });
    
    video.addEventListener('seeked', () => {
        // 创建缩略图
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 更新缩略图
        updateThumbnail(canvas.toDataURL('image/jpeg'));
        
        // 清理资源
        URL.revokeObjectURL(video.src);
    });
    
    video.load();
}

// 打开媒体库
function openGallery() {
    // showNotification('正在打开媒体库...');
    
    try {
        // 获取当前窗口引用
        const mainWindow = nw.Window.get();
        
        // 使用NW.js打开媒体库窗口
        nw.Window.open('gallery.html', {
            width: 1000,
            height: 650,
            min_width: 800,
            min_height: 600,
            frame: false,
            transparent: false,
            toolbar: false,
            title: '媒体库',
            position: 'center',
            focus: true,
            // 设置为子窗口
            new_instance: false,
            inject_js_start: `
                window.mainWindow = window.opener;
            `
        }, function(galleryWin) {
            if (galleryWin) {
                console.log('媒体库窗口已打开');
                
                // 保存主窗口引用到媒体库窗口中
                galleryWin.mainWindow = mainWindow;
                
                // 监听媒体库窗口隐藏事件
                galleryWin.on('hide', function() {
                    console.log('媒体库窗口已隐藏，显示主窗口');
                    mainWindow.show();
                    mainWindow.focus();
                });
                
                // 当媒体库窗口聚焦时可以隐藏主窗口（可选）
                galleryWin.on('focus', function() {
                    // 可以选择是否隐藏主窗口
                    // mainWindow.hide();
                });
            } else {
                console.error('无法打开媒体库窗口');
                showNotification('无法打开媒体库窗口', 3000);
            }
        });
    } catch (err) {
        console.error('打开媒体库窗口时出错:', err);
        // showNotification('打开媒体库失败，请重试', 5000);
        
        // 作为备选方案，使用iframe显示媒体库
        showIframeGallery();
    }
}

// iframe媒体库页面作为后备方案
function showIframeGallery() {
    console.log('使用iframe作为后备方案显示媒体库页面');
    
    // 创建一个模态对话框
    const modal = document.createElement('div');
    modal.className = 'gallery-modal';
    modal.innerHTML = `
        <div class="gallery-modal-content">
            <div class="gallery-modal-header">
                <h3>媒体库</h3>
                <button class="gallery-close-btn">×</button>
            </div>
            <div class="gallery-modal-body">
                <iframe src="gallery.html" width="100%" height="100%" frameborder="0"></iframe>
            </div>
        </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .gallery-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            animation: fadeIn 0.3s;
        }
        .gallery-modal-content {
            background-color: var(--bg-color);
            width: 90%;
            height: 90%;
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }
        .gallery-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background-color: rgba(32, 32, 32, 0.9);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .gallery-modal-header h3 {
            font-size: 16px;
            font-weight: 500;
            margin: 0;
        }
        .gallery-close-btn {
            background: transparent;
            border: none;
            color: var(--text-color);
            font-size: 24px;
            cursor: pointer;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
        }
        .gallery-close-btn:hover {
            background-color: rgba(255, 255, 255, 0.1);
        }
        .gallery-modal-body {
            flex: 1;
            overflow: hidden;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(modal);
    
    // 关闭按钮功能
    const closeBtn = modal.querySelector('.gallery-close-btn');
    closeBtn.addEventListener('click', () => {
        modal.remove();
        style.remove();
    });
}

// 事件监听
captureBtn.addEventListener('click', () => {
    if (currentMode === 'photo') {
        takePhoto();
    } else if (currentMode === 'video') {
        handleVideoCapture();
    } else if (currentMode === 'scan') {
        handleScan();
    }
});

switchCameraBtn.addEventListener('click', switchCamera);
rotateBtn.addEventListener('click', rotateVideo);
gridBtn.addEventListener('click', toggleGrid);
timerBtn.addEventListener('click', cycleTimer);
galleryBtn.addEventListener('click', openGallery);

// 窗口控制
minimizeBtn.addEventListener('click', () => {
    win.minimize();
});

closeBtn.addEventListener('click', () => {
    win.close();
});

// 打开设置页面
function openSettings() {
    console.log('打开设置页面');
    
    // 直接使用iframe方式显示设置页面，避免闪白屏
    showIframeSettings();
    return;
    
    /* 以下代码保留但不执行，仅作为备选方案
    try {
        // 获取当前窗口引用
        const mainWindow = nw.Window.get();
        
        // 使用NW.js打开设置窗口
        nw.Window.open('settings.html', {
            width: 900,
            height: 650,
            min_width: 800,
            min_height: 600,
            frame: false,
            transparent: false,
            title: '设置',
            position: 'center',
            focus: true,
            // 设置为子窗口
            new_instance: false,
            inject_js_start: `
                window.mainWindow = window.opener;
            `
        }, function(settingsWin) {
            if (settingsWin) {
                console.log('设置窗口已打开');
                
                // 保存主窗口引用和当前视频流到设置窗口
                settingsWin.mainWindow = mainWindow;
                settingsWin.mainStream = currentStream;
                
                // 监听设置更新事件
                mainWindow.addEventListener('settings_updated', function onSettingsUpdated() {
                    console.log('设置已更新');
                    
                    // 重新加载设置
                    loadSettings();
                    
                    // 根据需要更新UI状态
                    updateButtonStates();
                    
                    // 移除监听器，防止多次添加
                    mainWindow.removeEventListener('settings_updated', onSettingsUpdated);
                });
                
                // 监听设置窗口关闭事件
                settingsWin.on('closed', function() {
                    console.log('设置窗口已关闭');
                    
                    // 确保主窗口可见
                    mainWindow.show();
                    mainWindow.focus();
                });
            } else {
                console.error('无法打开设置窗口');
                showNotification('无法打开设置窗口', 3000);
            }
        });
    } catch (err) {
        console.error('打开设置窗口时出错:', err);
        // 作为备选方案，使用iframe显示设置
        showIframeSettings();
    }
    */
}

// iframe设置页面作为默认方案
function showIframeSettings() {
    console.log('使用iframe显示设置页面');
    
    // 创建一个模态对话框
    const modal = document.createElement('div');
    modal.className = 'settings-modal';
    modal.innerHTML = `
        <div class="settings-modal-content">
            <div class="settings-modal-header">
                <h3>设置</h3>
                <button class="settings-close-btn">×</button>
            </div>
            <div class="settings-modal-body">
                <iframe src="settings.html" width="100%" height="100%" frameborder="0"></iframe>
            </div>
        </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .settings-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            animation: fadeIn 0.3s;
        }
        .settings-modal-content {
            background-color: var(--bg-color);
            width: 90%;
            height: 90%;
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }
        .settings-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background-color: rgba(32, 32, 32, 0.9);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .settings-modal-header h3 {
            font-size: 16px;
            font-weight: 500;
            margin: 0;
        }
        .settings-close-btn {
            background: transparent;
            border: none;
            color: var(--text-color);
            font-size: 24px;
            cursor: pointer;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
        }
        .settings-close-btn:hover {
            background-color: rgba(255, 255, 255, 0.1);
        }
        .settings-modal-body {
            flex: 1;
            overflow: hidden;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(modal);
    
    // 关闭按钮功能
    const closeBtn = modal.querySelector('.settings-close-btn');
    closeBtn.addEventListener('click', () => {
        modal.remove();
        style.remove();
        
        // 重新加载设置和初始化相机
        loadSettings();
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        init();
    });
    
    // 监听iframe中返回按钮的点击
    const iframe = modal.querySelector('iframe');
    iframe.onload = function() {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const backButton = iframeDoc.getElementById('back-button');
            
            if (backButton) {
                // 覆盖iframe中返回按钮的原有事件处理
                backButton.addEventListener('click', function(e) {
                    // 阻止原事件
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // 关闭模态窗口
                    modal.remove();
                    style.remove();
                    
                    // 重新加载设置和初始化相机
                    loadSettings();
                    if (currentStream) {
                        currentStream.getTracks().forEach(track => track.stop());
                    }
                    init();
                });
            } else {
                console.error('无法找到iframe中的返回按钮');
            }
        } catch (err) {
            console.error('访问iframe内容时出错:', err);
        }
    };
}

// 重新绑定设置按钮事件
if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettings);
} else {
    console.error('找不到设置按钮，尝试延迟绑定');
    // 如果找不到按钮，等待DOM完全加载后再次尝试
    setTimeout(() => {
        const delayedSettingsBtn = document.querySelector('.settings-btn');
        if (delayedSettingsBtn) {
            console.log('延迟找到设置按钮，添加点击事件');
            delayedSettingsBtn.addEventListener('click', openSettings);
        } else {
            console.error('延迟后仍找不到设置按钮');
            // 为所有可能的设置按钮添加事件
            document.querySelectorAll('.sidebar-btn').forEach(btn => {
                console.log('为侧边栏按钮添加点击事件');
                btn.addEventListener('click', openSettings);
            });
        }
    }, 1000);
}

// 监听来自设置窗口的更新事件
window.addEventListener('settings_updated', () => {
    console.log('收到设置更新事件，重新加载设置');
    loadSettings();
});

// 监听UI更新事件
window.addEventListener('ui_updated', () => {
    console.log('收到UI更新事件，更新界面状态');
    loadSettings();
    updateButtonStates();
});

// 监听流更新事件
window.addEventListener('stream_updated', () => {
    console.log('收到流更新事件，应用新的视频设置');
    // 应用镜像设置
    if (appSettings.camera.mirror) {
        preview.style.transform = 'scaleX(-1)';
        if (processedCanvas) {
            processedCanvas.style.transform = 'scaleX(-1)';
        }
    } else {
        preview.style.transform = 'scaleX(1)';
        if (processedCanvas) {
            processedCanvas.style.transform = 'scaleX(1)';
        }
    }
});

// 监听镜像设置更新事件
window.addEventListener('mirror_updated', () => {
    console.log('收到镜像设置更新事件');
    try {
        // 应用镜像和旋转设置
        applyTransform();
        
        // 保存设置到本地存储
        localStorage.setItem('cameraAppSettings', JSON.stringify(appSettings));
        
        // 更新UI状态
        updateButtonStates();
        
        console.log('镜像设置更新完成:', appSettings.camera.mirror ? '已开启' : '已关闭');
    } catch (err) {
        console.error('应用镜像设置时出错:', err);
    }
});

// 初始化调试面板
function initDebugPanel() {
    // 创建调试面板容器
    debugPanel = document.createElement('div');
    debugPanel.className = 'debug-panel';
    debugPanel.style.display = 'none';
    debugPanel.innerHTML = `
        <div class="debug-panel-header">
            <span>调试信息面板</span>
            <div class="debug-panel-controls">
                <button class="debug-clear-btn" title="清空调试信息">清空</button>
                <button class="debug-close-btn" title="关闭面板">×</button>
            </div>
        </div>
        <div class="debug-panel-content"></div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .debug-panel {
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: 50%;
            max-width: 600px;
            height: 300px;
            background-color: rgba(0, 0, 0, 0.85);
            color: #ffffff;
            border-radius: 8px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
            resize: both;
            overflow: hidden;
            font-family: monospace;
            font-size: 12px;
        }
        .debug-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background-color: rgba(60, 60, 60, 0.9);
            border-top-left-radius: 8px;
            border-top-right-radius: 8px;
            cursor: move;
            user-select: none;
        }
        .debug-panel-controls {
            display: flex;
            gap: 8px;
        }
        .debug-panel-controls button {
            background: transparent;
            border: none;
            color: #fff;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 4px;
        }
        .debug-panel-controls button:hover {
            background-color: rgba(255, 255, 255, 0.2);
        }
        .debug-panel-content {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            font-family: monospace;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .debug-message {
            margin-bottom: 4px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 4px;
        }
        .debug-log { color: #ffffff; }
        .debug-error { color: #ff5555; }
        .debug-warn { color: #ffaa00; }
        .debug-info { color: #55aaff; }
        .debug-timestamp {
            color: #888;
            margin-right: 6px;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(debugPanel);
    
    // 添加事件监听
    const clearBtn = debugPanel.querySelector('.debug-clear-btn');
    clearBtn.addEventListener('click', clearDebugPanel);
    
    const closeBtn = debugPanel.querySelector('.debug-close-btn');
    closeBtn.addEventListener('click', toggleDebugPanel);
    
    // 添加拖动功能
    makeDraggable(debugPanel, debugPanel.querySelector('.debug-panel-header'));
    
    // 重写console方法
    overrideConsoleMethods();
    
    console.log('调试面板已初始化');
}

// 拦截控制台方法
function overrideConsoleMethods() {
    console.log = function(...args) {
        addDebugMessage('log', ...args);
        originalConsole.log.apply(console, args);
    };
    
    console.error = function(...args) {
        addDebugMessage('error', ...args);
        originalConsole.error.apply(console, args);
    };
    
    console.warn = function(...args) {
        addDebugMessage('warn', ...args);
        originalConsole.warn.apply(console, args);
    };
    
    console.info = function(...args) {
        addDebugMessage('info', ...args);
        originalConsole.info.apply(console, args);
    };
}

// 添加调试信息到面板
function addDebugMessage(type, ...args) {
    if (!debugPanel) return;
    
    // 格式化消息
    let formattedArgs = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
    
    // 创建时间戳
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    
    // 将消息添加到数组
    debugMessages.push({
        type,
        message: formattedArgs,
        timestamp
    });
    
    // 保持消息数量在限制范围内
    if (debugMessages.length > maxDebugMessages) {
        debugMessages.shift();
    }
    
    // 如果面板可见，更新显示
    updateDebugPanelContent();
}

// 更新调试面板内容
function updateDebugPanelContent() {
    if (!debugPanel || debugPanel.style.display === 'none') return;
    
    const content = debugPanel.querySelector('.debug-panel-content');
    
    // 清空当前内容
    content.innerHTML = '';
    
    // 添加所有消息
    debugMessages.forEach(item => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `debug-message debug-${item.type}`;
        messageDiv.innerHTML = `<span class="debug-timestamp">[${item.timestamp}]</span> ${item.message}`;
        content.appendChild(messageDiv);
    });
    
    // 滚动到底部
    content.scrollTop = content.scrollHeight;
}

// 清空调试面板
function clearDebugPanel() {
    debugMessages = [];
    updateDebugPanelContent();
    console.log('调试面板已清空');
}

// 切换调试面板显示
function toggleDebugPanel() {
    if (!debugPanel) {
        initDebugPanel();
    }
    
    debugPanelEnabled = !debugPanelEnabled;
    debugPanel.style.display = debugPanelEnabled ? 'flex' : 'none';
    
    if (debugPanelEnabled) {
        updateDebugPanelContent();
        showNotification('调试面板已显示');
    } else {
        showNotification('调试面板已隐藏');
    }
}

// 使元素可拖动
function makeDraggable(element, dragHandle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    dragHandle.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
        e.preventDefault();
        // 获取鼠标位置
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    
    function elementDrag(e) {
        e.preventDefault();
        // 计算新位置
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // 设置元素新位置
        const newTop = (element.offsetTop - pos2);
        const newLeft = (element.offsetLeft - pos1);
        
        // 确保不超出窗口
        if (newTop > 0 && newTop < window.innerHeight - 50) {
            element.style.top = newTop + "px";
        }
        if (newLeft > 0 && newLeft < window.innerWidth - 50) {
            element.style.left = newLeft + "px";
        }
    }
    
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// 开发者工具相关
let devToolsOpen = false;

function toggleDevTools() {
  try {
    const win = nw.Window.get();
    if (!devToolsOpen) {
      win.showDevTools();
      devToolsOpen = true;
    } else {
      win.closeDevTools();
      devToolsOpen = false;
    }
  } catch (error) {
    console.error('切换开发者工具时出错:', error);
  }
}

// 添加键盘快捷键监听
document.addEventListener('keydown', (e) => {
  // Space键拍照/录像
  if (e.code === 'Space') {
    captureBtn.click();
  }
  
  // Esc键关闭应用
  if (e.code === 'Escape') {
    closeBtn.click();
  }
  
  // S键打开设置
  if (e.code === 'KeyS') {
    settingsBtn.click();
  }

  // P键切换处理开关
  if (e.code === 'KeyP') {
    processingEnabled = !processingEnabled;
    processedCanvas.style.display = processingEnabled ? 'block' : 'none';
    preview.style.display = processingEnabled ? 'none' : 'block';
    showNotification(`图像处理: ${processingEnabled ? '开启' : '关闭'}`);
  }
  
  // D键切换调试面板
  if (e.code === 'KeyD' && e.ctrlKey) {
    e.preventDefault();
    toggleDebugPanel();
  }

  // F12或Ctrl+Shift+I打开开发者工具
  if (e.code === 'F12' || (e.ctrlKey && e.shiftKey && e.code === 'KeyI')) {
    e.preventDefault();
    toggleDevTools();
  }
});

// 在页面加载完成后初始化
window.addEventListener('load', () => {
  try {
    // 添加错误处理
    window.onerror = function(message, source, lineno, colno, error) {
      console.error('全局错误:', {
        message,
        source,
        lineno,
        colno,
        error
      });
      return false;
    };

    // 添加未捕获的Promise错误处理
    window.addEventListener('unhandledrejection', function(event) {
      console.error('未处理的Promise错误:', event.reason);
    });

    // 初始化缩放控制
    initZoomControls();
    
    // 初始化调试面板
    initDebugPanel();

    console.log('应用已启动，按 F12 或 Ctrl+Shift+I 打开开发者工具');
    console.log('按 Ctrl+D 显示/隐藏调试面板');
  } catch (error) {
    console.error('初始化错误处理时出错:', error);
  }
});

// 在初始化时获取可用相机列表
document.addEventListener('DOMContentLoaded', async function() {
    // ... 现有的 DOMContentLoaded 代码 ...
    
    // 获取可用相机列表
    await getAvailableCameras();
    
    // 绑定切换相机按钮事件
    if (switchCameraBtn) {
        switchCameraBtn.addEventListener('click', async () => {
            if (!switchCameraBtn.disabled) {
                await switchCamera();
            } else {
                showNotification('没有其他可用的相机设备');
            }
        });
    }
});

// 监听设备变化（比如插入或移除相机）
navigator.mediaDevices.addEventListener('devicechange', async () => {
    console.log('检测到设备变化，重新获取相机列表');
    await getAvailableCameras();
});

// 监听来自设置窗口的消息
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'update_mirror') {
        console.log('收到镜像设置更新消息:', event.data.mirror);
        
        // 更新设置
        appSettings.camera.mirror = event.data.mirror;
        
        // 应用镜像和旋转设置
        applyTransform();
        
        // 保存设置到本地存储
        localStorage.setItem('cameraAppSettings', JSON.stringify(appSettings));
        
        // 触发更新事件
        window.dispatchEvent(new Event('mirror_updated'));
    }
});

// 添加旋转视频功能
function rotateVideo() {
    // 每次点击旋转90度
    currentRotation = (currentRotation + 90) % 360;
    console.log(`旋转视频到 ${currentRotation} 度`);
    
    // 应用旋转到预览元素
    applyTransform();
    
    // 更新按钮状态
    updateButtonStates();
    
    // 显示提示信息
    showNotification(`已旋转视频至 ${currentRotation}°`);
}

// 应用旋转和缩放到预览元素
function applyTransform() {
    // 先保存镜像状态
    const isMirrored = appSettings.camera.mirror;
    const mirrorTransform = isMirrored ? 'scaleX(-1)' : '';
    const previewContainer = preview.parentElement;
    
    // 如果不存在预览元素或容器，直接返回
    if (!preview || !processedCanvas || !previewContainer) return;
    
    // 移除之前可能添加的类
    previewContainer.classList.remove('rotated-video');
    
    // 获取容器尺寸和视频尺寸以计算适当的缩放比例
    const containerWidth = previewContainer.clientWidth;
    const containerHeight = previewContainer.clientHeight;
    const videoWidth = preview.videoWidth || containerWidth;
    const videoHeight = preview.videoHeight || containerHeight;
    
    // 基本变换：旋转+镜像+缩放+平移
    let transformValue = '';
    
    // 根据不同的旋转角度应用不同的变换
    if (currentRotation === 0) {
        // 不旋转，只应用缩放和平移
        transformValue = `${mirrorTransform} translate(${translateX}px, ${translateY}px) scale(${currentZoom})`;
        
        preview.style.transform = transformValue;
        preview.style.width = '100%';
        preview.style.height = '100%';
        preview.style.top = '0';
        preview.style.left = '0';
        preview.style.maxWidth = '100%';
        preview.style.maxHeight = '100%';
        preview.style.position = 'absolute';
        
        processedCanvas.style.transform = transformValue;
        processedCanvas.style.width = '100%';
        processedCanvas.style.height = '100%';
        processedCanvas.style.top = '0';
        processedCanvas.style.left = '0';
        processedCanvas.style.maxWidth = '100%';
        processedCanvas.style.maxHeight = '100%';
        processedCanvas.style.position = 'absolute';
    } else {
        // 添加旋转类以应用特殊样式
        previewContainer.classList.add('rotated-video');
        
        // 当视频旋转90度或270度时
        if (currentRotation === 90 || currentRotation === 270) {
            // 计算旋转后的适应比例
            // 对于90/270度旋转，视频的宽高会互换，需要重新计算缩放比例
            let scale = 1;
            
            // 根据容器的宽高比和视频的高宽比(旋转后)计算合适的缩放值
            const containerRatio = containerWidth / containerHeight;
            const rotatedVideoRatio = videoHeight / videoWidth; // 旋转后宽高互换
            
            if (containerRatio > rotatedVideoRatio) {
                // 容器更宽，以高度为基准
                scale = (containerHeight * 0.9) / videoWidth; // 保留10%的边距
            } else {
                // 容器更高，以宽度为基准
                scale = (containerWidth * 0.9) / videoHeight; // 保留10%的边距
            }
            
            // 应用变换，包括居中、镜像、旋转、缩放和平移
            transformValue = `translate(-50%, -50%) ${mirrorTransform} rotate(${currentRotation}deg) scale(${scale * currentZoom}) translate(${translateX / scale}px, ${translateY / scale}px)`;
            
            // 设置为绝对定位以便居中
            preview.style.position = 'absolute';
            preview.style.top = '50%';
            preview.style.left = '50%';
            preview.style.width = `${videoWidth}px`;
            preview.style.height = `${videoHeight}px`;
            preview.style.maxWidth = 'none';
            preview.style.maxHeight = 'none';
            preview.style.transform = transformValue;
            
            processedCanvas.style.position = 'absolute';
            processedCanvas.style.top = '50%';
            processedCanvas.style.left = '50%';
            processedCanvas.style.width = `${videoWidth}px`;
            processedCanvas.style.height = `${videoHeight}px`;
            processedCanvas.style.maxWidth = 'none';
            processedCanvas.style.maxHeight = 'none';
            processedCanvas.style.transform = transformValue;
        } else {
            // 180度旋转，应用缩放和平移
            transformValue = `${mirrorTransform} rotate(${currentRotation}deg) scale(${currentZoom}) translate(${translateX / currentZoom}px, ${translateY / currentZoom}px)`;
            
            preview.style.position = 'absolute';
            preview.style.top = '0';
            preview.style.left = '0';
            preview.style.width = '100%';
            preview.style.height = '100%';
            preview.style.transform = transformValue;
            
            processedCanvas.style.position = 'absolute';
            processedCanvas.style.top = '0';
            processedCanvas.style.left = '0';
            processedCanvas.style.width = '100%';
            processedCanvas.style.height = '100%';
            processedCanvas.style.transform = transformValue;
        }
    }
    
    // 如果有隐藏的canvas元素，也应用相同的变换
    const hiddenCanvas = document.getElementById('hidden-canvas');
    if (hiddenCanvas) {
        hiddenCanvas.style.transform = preview.style.transform;
        hiddenCanvas.style.width = preview.style.width;
        hiddenCanvas.style.height = preview.style.height;
        hiddenCanvas.style.top = preview.style.top;
        hiddenCanvas.style.left = preview.style.left;
        hiddenCanvas.style.maxWidth = preview.style.maxWidth;
        hiddenCanvas.style.maxHeight = preview.style.maxHeight;
        hiddenCanvas.style.position = preview.style.position;
    }
    
    console.log(`已应用变换: 旋转=${currentRotation}度, 缩放=${currentZoom.toFixed(2)}, 平移X=${translateX.toFixed(0)}, Y=${translateY.toFixed(0)}, 镜像=${isMirrored}`);
}

// 添加初始化时应用旋转和镜像设置
function applySettingsToVideo() {
    // 应用旋转和镜像设置到视频
    applyTransform();
    console.log('已应用旋转和镜像设置到视频');
}

// 初始化缩放控制
function initZoomControls() {
    console.log('初始化缩放和拖动控制...');
    
    // 获取预览容器
    const previewContainer = preview.parentElement;
    if (!previewContainer) {
        console.error('找不到预览容器，无法初始化缩放和拖动控制');
        return;
    }
    
    // 添加鼠标滚轮事件监听器，用于缩放
    previewContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // 计算缩放增量
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        currentZoom = Math.max(0.5, Math.min(3.0, currentZoom + delta));
        
        // 应用变换
        applyTransform();
        
        // 显示缩放提示
        showNotification(`缩放比例: ${Math.round(currentZoom * 100)}%`);
    }, { passive: false });
    
    // 添加鼠标事件监听器，用于拖动
    previewContainer.addEventListener('mousedown', (e) => {
        // 只有在视频已经缩放的情况下才允许拖动
        if (currentZoom <= 1.0) return;
        
        // 记录拖动开始位置
        isDragging = true;
        dragStartX = e.clientX - translateX;
        dragStartY = e.clientY - translateY;
        
        // 修改鼠标样式
        previewContainer.style.cursor = 'grabbing';
    });
    
    // 添加鼠标移动事件
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        // 计算新的平移值
        translateX = e.clientX - dragStartX;
        translateY = e.clientY - dragStartY;
        
        // 应用变换
        applyTransform();
    });
    
    // 添加鼠标释放事件
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            previewContainer.style.cursor = currentZoom > 1.0 ? 'grab' : 'default';
        }
    });
    
    // 添加鼠标进入事件
    previewContainer.addEventListener('mouseenter', () => {
        if (currentZoom > 1.0) {
            previewContainer.style.cursor = 'grab';
        }
    });
    
    // 添加鼠标离开事件
    previewContainer.addEventListener('mouseleave', () => {
        isDragging = false;
        previewContainer.style.cursor = 'default';
    });
    
    // 添加双击事件用于重置缩放
    previewContainer.addEventListener('dblclick', () => {
        currentZoom = 1.0;
        translateX = 0;
        translateY = 0;
        applyTransform();
        showNotification('已重置缩放和位置');
    });
    
    console.log('缩放和拖动控制初始化完成');
}

// 初始化应用
init(); 