// DOM 元素
const galleryContainer = document.querySelector('.gallery-container');
const mediaViewer = document.querySelector('.media-viewer');
const currentImage = document.getElementById('current-image');
const currentVideo = document.getElementById('current-video');
const backButton = document.getElementById('back-button');
const minimizeBtn = document.querySelector('.minimize-btn');
const closeBtn = document.querySelector('.close-btn');
const viewerBackBtn = document.querySelector('.viewer-back-btn');
const prevBtn = document.querySelector('.prev-btn');
const nextBtn = document.querySelector('.next-btn');
const thumbnailItems = document.querySelectorAll('.thumbnail-item');
const sidebarItems = document.querySelectorAll('.sidebar-item');
const filterBtns = document.querySelectorAll('.filter-btn');
const mediaItems = document.querySelectorAll('.media-item');

// 示例媒体数据（实际应用中应从存储中获取）
const mediaData = [
    {
        id: 1,
        type: 'photo',
        src: 'assets/placeholder.jpg',
        thumbnail: 'assets/placeholder.jpg',
        date: '2023/04/04 14:32',
        location: '重庆市',
        favorite: false
    },
    {
        id: 2,
        type: 'video',
        src: 'assets/sample_video.mp4',
        thumbnail: 'assets/video_placeholder.jpg',
        duration: '0:32',
        date: '2023/04/04 14:30',
        location: '重庆市',
        favorite: false
    },
    {
        id: 3,
        type: 'photo',
        src: 'assets/placeholder2.jpg',
        thumbnail: 'assets/placeholder2.jpg',
        date: '2023/04/03 18:45',
        location: '重庆市',
        favorite: false
    }
];

// 当前查看的媒体索引
let currentMediaIndex = 0;
let panzoomInstance = null;
let isDragging = false;
let startX, startY;
let translateX = 0, translateY = 0;
let scale = 1;
let lastScale = 1;
let isFromMediaViewer = false; // 添加标记变量

// 图像增强相关变量
let originalImageStyle = null;
let currentEnhanceValues = {};

// 调试工具状态追踪
let galleryDevToolsOpen = false;

// 安全打开调试工具方法
function safeOpenDevTools() {
    try {
        // 确保nw对象可用
        if (typeof nw === 'undefined') {
            console.error('无法访问nw对象，可能不在NW.js环境中');
            return;
        }
        
        // 获取当前窗口
        const currentWin = nw.Window.get();
        
        // 使用setTimeout防止立即打开可能导致的问题
        setTimeout(() => {
            try {
                if (!galleryDevToolsOpen) {
                    // 使用专用选项打开开发者工具
                    currentWin.showDevTools({
                        mode: 'detach', // 分离模式，避免影响主窗口
                        show: true      // 确保显示
                    });
                    galleryDevToolsOpen = true;
                    console.log('开发者工具已打开');
                } else {
                    // 如果已打开，尝试关闭
                    currentWin.closeDevTools();
                    galleryDevToolsOpen = false;
                    console.log('开发者工具已关闭');
                }
            } catch (innerError) {
                console.error('打开开发者工具时出错:', innerError);
                // 不抛出异常，确保程序继续运行
            }
        }, 100);
    } catch (error) {
        console.error('初始化开发者工具时出错:', error);
        // 不抛出异常，确保程序继续运行
    }
}

// 添加自定义键盘快捷键处理
document.addEventListener('keydown', function(e) {
    // 拦截F12，防止触发主程序的开发者工具
    if (e.key === 'F12') {
        console.log('拦截F12事件，改用自定义调试方法');
        e.preventDefault();
        e.stopPropagation();
        safeOpenDevTools();
        return false;
    }
    
    // 使用不同的快捷键组合，避免与主程序F12冲突
    // 使用Ctrl+Shift+D或Alt+D
    if ((e.ctrlKey && e.shiftKey && e.code === 'KeyD') || 
        (e.altKey && e.code === 'KeyD')) {
        e.preventDefault(); // 阻止默认行为
        e.stopPropagation(); // 阻止事件传播到父窗口
        console.log('触发gallery页面开发者工具快捷键');
        safeOpenDevTools();
        return false;
    }
});

// 创建一个调试按钮（仅在开发环境中可见）
function addDebugButton() {
    try {
        if (localStorage.getItem('devMode') === 'true') {
            const debugBtn = document.createElement('button');
            debugBtn.textContent = '调试';
            debugBtn.style.position = 'fixed';
            debugBtn.style.bottom = '10px';
            debugBtn.style.right = '10px';
            debugBtn.style.zIndex = '9999';
            debugBtn.style.padding = '5px 10px';
            debugBtn.style.backgroundColor = 'rgba(0,0,0,0.7)';
            debugBtn.style.color = 'white';
            debugBtn.style.border = '1px solid #666';
            debugBtn.style.borderRadius = '4px';
            debugBtn.style.fontSize = '12px';
            debugBtn.style.cursor = 'pointer';
            debugBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                safeOpenDevTools();
            });
            document.body.appendChild(debugBtn);
            console.log('已添加调试按钮');
        }
    } catch (error) {
        console.error('添加调试按钮失败:', error);
    }
}

// 在初始化函数中调用添加调试按钮
document.addEventListener('DOMContentLoaded', function() {
    // 等待DOM加载完成后添加调试按钮
    setTimeout(addDebugButton, 1000);
});

// 初始化
function init() {
    // 设置开发模式，使调试按钮可见
    try {
        localStorage.setItem('devMode', 'true');
    } catch (error) {
        console.error('设置开发模式失败:', error);
    }
    
    // 获取返回按钮
    const backButton = document.getElementById('back-button');
    if (backButton) {
        // 初始显示返回按钮（从主界面进入时）
        backButton.style.display = 'flex';
        
        // 返回按钮点击事件
        backButton.addEventListener('click', () => {
            // 返回主窗口而不是关闭应用
            if (typeof nw !== 'undefined') {
                const win = nw.Window.get();
                // 隐藏当前窗口
                win.hide();
                
                // 如果有主窗口引用，确保它可见并聚焦
                if (win.mainWindow) {
                    win.mainWindow.show();
                    win.mainWindow.focus();
                } else if (window.opener) {
                    // 尝试通过opener获取主窗口
                    window.opener.focus();
                }
            } else {
                // 在iframe中，告诉父窗口关闭媒体库
                window.parent.postMessage('close_gallery', '*');
            }
        });
    }
    
    // 绑定其他事件
    bindEvents();
    
    // 创建资源文件夹，确保存在
    createAssetsFolder();
    
    // 加载媒体数据
    loadMedia().then(() => {
        // 加载完媒体数据后，加载收藏状态
        loadFavoritesFromStorage();
        // 更新UI
        updateGalleryUI();
    });
}

// 创建资源文件夹（确保存在）
function createAssetsFolder() {
    try {
        // 检查NW.js环境
        if (typeof nw !== 'undefined') {
            const fs = nw.require('fs');
            const path = nw.require('path');
            
            // 获取应用程序目录
            const appPath = nw.App.dataPath;
            const assetsPath = path.join(appPath, 'assets');
            
            // 检查assets文件夹是否存在，不存在则创建
            if (!fs.existsSync(assetsPath)) {
                fs.mkdirSync(assetsPath, { recursive: true });
                console.log('创建assets文件夹:', assetsPath);
            }
        }
    } catch (err) {
        console.error('创建资源文件夹失败:', err);
    }
}

// 获取视频缩略图
async function generateVideoThumbnail(videoPath) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        video.src = videoPath;
        video.crossOrigin = 'anonymous';
        
        // 设置视频加载事件
        video.addEventListener('loadedmetadata', () => {
            // 设置画布尺寸为视频的实际尺寸
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            // 设置视频到特定时间点（这里设置为1秒）
            video.currentTime = 1;
        });
        
        // 当视频可以播放时捕获画面
        video.addEventListener('seeked', () => {
            // 在画布上绘制视频帧
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // 将画布内容转换为base64图片
            const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
            
            // 清理资源
            video.remove();
            resolve(thumbnailUrl);
        });
        
        // 错误处理
        video.addEventListener('error', () => {
            console.error('生成视频缩略图失败:', videoPath);
            resolve(null);
        });
    });
}

// 加载媒体数据
async function loadMedia() {
    console.log('加载媒体数据...');
    
    try {
        // 检查NW.js环境
        if (typeof nw === 'undefined') {
            console.error('不在NW.js环境中');
            return;
        }

        const fs = nw.require('fs').promises;
        const path = nw.require('path');
        
        // 从localStorage获取保存的设置
        const savedSettings = localStorage.getItem('cameraAppSettings');
        let savePath = 'Pictures/Camera'; // 默认路径
        
        if (savedSettings) {
            try {
                const settings = JSON.parse(savedSettings);
                savePath = settings.photo.savePath;
            } catch (err) {
                console.error('解析设置失败:', err);
            }
        }

        // 确保路径存在
        try {
            await fs.access(savePath);
        } catch (err) {
            console.error('保存路径不存在:', err);
            return;
        }

        // 读取目录内容
        const files = await fs.readdir(savePath);
        const mediaFiles = [];

        // 遍历文件
        for (const file of files) {
            const filePath = path.join(savePath, file);
            const stats = await fs.stat(filePath);
            
            // 检查是否是文件
            if (stats.isFile()) {
                const ext = path.extname(file).toLowerCase();
                let type = null;
                
                // 判断文件类型
                if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
                    type = 'photo';
                } else if (['.mp4', '.webm', '.mov'].includes(ext)) {
                    type = 'video';
                }
                
                if (type) {
                    let thumbnail = filePath;
                    let duration = null;
                    
                    // 如果是视频，生成缩略图和获取时长
                    if (type === 'video') {
                        // 生成缩略图
                        thumbnail = await generateVideoThumbnail(filePath);
                        // 如果缩略图生成失败，使用默认图片
                        if (!thumbnail) {
                            thumbnail = 'assets/video_placeholder.jpg';
                        }
                        // 获取视频时长
                        duration = await getVideoDuration(filePath);
                    }
                    
                    mediaFiles.push({
                        id: mediaFiles.length + 1,
                        type: type,
                        src: filePath,
                        thumbnail: thumbnail,
                        date: stats.mtime.toLocaleString(),
                        location: '',
                        favorite: false,
                        duration: duration
                    });
                }
            }
        }

        // 按日期排序（最新的在前）
        mediaFiles.sort((a, b) => new Date(b.date) - new Date(a.date));

        // 清空现有的媒体数据
        mediaData.length = 0;
        mediaData.push(...mediaFiles);

        // 更新UI
        updateGalleryUI();
        
    } catch (err) {
        console.error('加载媒体数据失败:', err);
    }
}

// 获取视频时长
async function getVideoDuration(videoPath) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.src = videoPath;
        
        video.addEventListener('loadedmetadata', () => {
            const duration = Math.round(video.duration);
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            resolve(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        });
        
        video.addEventListener('error', () => {
            resolve('0:00');
        });
    });
}

// 更新媒体库UI
function updateGalleryUI(type = 'all') {
    // 获取媒体容器
    const mediaContainer = document.querySelector('.media-container');
    if (!mediaContainer) return;
    
    // 清空现有内容
    mediaContainer.innerHTML = '';
    
    // 筛选媒体
    let filteredMedia = [...mediaData];
    if (type === 'photos') {
        filteredMedia = mediaData.filter(m => m.type === 'photo');
    } else if (type === 'videos') {
        filteredMedia = mediaData.filter(m => m.type === 'video');
    } else if (type === 'favorites') {
        filteredMedia = mediaData.filter(m => m.favorite);
    }
    
    // 按日期分组
    const groupedMedia = groupMediaByDate(filteredMedia);
    
    // 创建并添加每个日期分组
    for (const [date, items] of Object.entries(groupedMedia)) {
        if (items.length === 0) continue;
        
        const dateSection = document.createElement('div');
        dateSection.className = 'date-section';
        
        const dateHeader = document.createElement('h3');
        dateHeader.className = 'date-header';
        dateHeader.textContent = formatDateHeader(date);
        dateSection.appendChild(dateHeader);
        
        const mediaGrid = document.createElement('div');
        mediaGrid.className = 'media-grid';
        
        // 添加媒体项
        items.forEach(media => {
            const mediaItem = createMediaThumbnail(media);
            mediaGrid.appendChild(mediaItem);
        });
        
        dateSection.appendChild(mediaGrid);
        mediaContainer.appendChild(dateSection);
    }
}

// 按日期分组媒体
function groupMediaByDate(mediaItems) {
    const groups = {};
    
    mediaItems.forEach(item => {
        const date = new Date(item.date).toLocaleDateString();
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(item);
    });
    
    return groups;
}

// 格式化日期标题
function formatDateHeader(dateStr) {
    const today = new Date().toLocaleDateString();
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();
    
    if (dateStr === today) {
        return '今天';
    } else if (dateStr === yesterday) {
        return '昨天';
    } else {
        return dateStr;
    }
}

// 绑定事件
function bindEvents() {
    // 关闭按钮
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            // 如果在NW.js环境中
            if (typeof nw !== 'undefined') {
                const win = nw.Window.get();
                win.close();
            } else {
                // 如果在iframe中打开，发送关闭消息
                window.parent.postMessage('close_gallery', '*');
            }
        });
    }
    
    // 最小化按钮
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
            if (typeof nw !== 'undefined') {
                const win = nw.Window.get();
                win.minimize();
            }
        });
    }
    
    // 媒体项点击
    mediaItems.forEach(item => {
        item.addEventListener('click', () => {
            const mediaType = item.getAttribute('data-type');
            const index = Array.from(mediaItems).indexOf(item);
            openMediaViewer(index, mediaType);
        });
    });
    
    // 媒体查看器返回按钮
    if (viewerBackBtn) {
        viewerBackBtn.addEventListener('click', closeMediaViewer);
    }
    
    // 前一个/后一个按钮
    if (prevBtn) {
        prevBtn.addEventListener('click', showPreviousMedia);
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', showNextMedia);
    }
    
    // 缩略图点击
    thumbnailItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            currentMediaIndex = index;
            updateMediaViewer();
        });
    });
    
    // 侧边栏项点击
    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            const type = item.getAttribute('data-type');
            filterMediaByType(type);
        });
    });
    
    // 筛选按钮点击
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const period = btn.getAttribute('data-period');
            filterMediaByPeriod(period);
        });
    });
    
    // 监听按键事件
    document.addEventListener('keydown', handleKeyPress);
    
    // 媒体查看器删除按钮
    const viewerDeleteBtn = document.querySelector('.viewer-delete-btn');
    if (viewerDeleteBtn) {
        viewerDeleteBtn.addEventListener('click', () => {
            if (mediaData[currentMediaIndex]) {
                deleteMedia(mediaData[currentMediaIndex].id);
            }
        });
    }
    
    // 初始化AI工具
    initAITools();
}

// 筛选媒体（按类型）
function filterMediaByType(type) {
    console.log('按类型筛选媒体:', type);
    
    // 更新侧边栏选中状态
    sidebarItems.forEach(item => {
        if (item.getAttribute('data-type') === type) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // 重置时间筛选按钮状态
    filterBtns.forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-period="all"]')?.classList.add('active');
    
    // 更新媒体显示
    updateGalleryUI(type);
}

// 筛选媒体（按时间段）
function filterMediaByPeriod(period) {
    console.log('按时间段筛选媒体:', period);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    // 获取所有日期分组
    const dateSections = document.querySelectorAll('.date-section');
    
    dateSections.forEach(section => {
        const dateHeader = section.querySelector('.date-header').textContent;
        let sectionDate;
        
        if (dateHeader === '今天') {
            sectionDate = today;
        } else if (dateHeader === '昨天') {
            sectionDate = yesterday;
        } else {
            sectionDate = new Date(dateHeader.replace(/年|月/g, '/').replace('日', ''));
        }
        
        let showSection = false;
        
        switch (period) {
            case 'all':
                showSection = true;
                break;
            case 'today':
                showSection = sectionDate >= today;
                break;
            case 'week':
                showSection = sectionDate >= weekAgo;
                break;
            case 'month':
                showSection = sectionDate >= monthAgo;
                break;
        }
        
        // 只显示符合时间条件的分组
        section.style.display = showSection ? 'block' : 'none';
    });
    
    // 更新筛选按钮状态
    filterBtns.forEach(btn => {
        if (btn.getAttribute('data-period') === period) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// 打开媒体查看器
function openMediaViewer(index, type) {
    currentMediaIndex = index;
    mediaViewer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    updateMediaViewer();
}

// 关闭媒体查看器
function closeMediaViewer() {
    // 销毁变换状态
    resetTransform();
    
    // 隐藏媒体查看器
    mediaViewer.style.display = 'none';
    document.body.style.overflow = 'auto';
    
    // 停止视频播放
    if (currentVideo) {
        currentVideo.pause();
        currentVideo.currentTime = 0;
    }
}

// 更新媒体查看器内容
function updateMediaViewer() {
    const media = mediaData[currentMediaIndex];
    if (!media) return;

    // 重置变换状态
    resetTransform();

    // 停止当前视频播放（如果有）
    if (currentVideo) {
        currentVideo.pause();
        currentVideo.currentTime = 0;
    }

    if (media.type === 'photo') {
        currentImage.style.display = 'block';
        currentVideo.style.display = 'none';
        
        // 设置图片源
        currentImage.src = media.src;
        
        // 添加事件监听器
        setupImageEvents();
        
        // 添加错误处理
        currentImage.onerror = function() {
            console.error('图片加载失败:', media.src);
        };
    } else if (media.type === 'video') {
        // 设置新的视频源
        currentVideo.querySelector('source').src = media.src;
        currentVideo.load();
        currentImage.style.display = 'none';
        currentVideo.style.display = 'block';
    }

    // 更新媒体信息
    updateMediaInfo(media);
    updateThumbnails();
    
    // 重置撤销按钮状态
    disableUndoButton();
}

// 设置图片事件
function setupImageEvents() {
    const image = currentImage;
    const container = document.querySelector('.viewer-content');
    
    // 鼠标滚轮缩放
    container.addEventListener('wheel', function(e) {
        e.preventDefault();
        const delta = e.deltaY;
        const zoomFactor = 0.05;
        
        if (delta < 0) {
            // 放大
            scale = Math.min(5, scale + zoomFactor);
        } else {
            // 缩小
            scale = Math.max(0.5, scale - zoomFactor);
        }
        
        updateTransform();
    });
    
    // 鼠标拖动
    container.addEventListener('mousedown', function(e) {
        if (e.button === 0) { // 左键
            isDragging = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            container.style.cursor = 'grabbing';
        }
    });
    
    document.addEventListener('mousemove', function(e) {
        if (isDragging) {
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            updateTransform();
        }
    });
    
    document.addEventListener('mouseup', function() {
        isDragging = false;
        container.style.cursor = 'grab';
    });
    
    // 双击重置
    container.addEventListener('dblclick', function() {
        resetTransform();
    });
    
    // 键盘控制
    document.addEventListener('keydown', function(e) {
        if (mediaViewer.style.display === 'flex') {
            switch(e.key) {
                case '+':
                case '=':
                    scale = Math.min(5, scale + 0.1);
                    updateTransform();
                    break;
                case '-':
                    scale = Math.max(0.5, scale - 0.1);
                    updateTransform();
                    break;
                case '0':
                    resetTransform();
                    break;
            }
        }
    });
}

// 更新变换
function updateTransform() {
    currentImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

// 重置变换
function resetTransform() {
    scale = 1;
    translateX = 0;
    translateY = 0;
    updateTransform();
}

// 显示上一个媒体
function showPreviousMedia() {
    currentMediaIndex = (currentMediaIndex - 1 + mediaData.length) % mediaData.length;
    updateMediaViewer();
}

// 显示下一个媒体
function showNextMedia() {
    currentMediaIndex = (currentMediaIndex + 1) % mediaData.length;
    updateMediaViewer();
}

// 处理键盘事件
function handleKeyPress(e) {
    // 如果媒体查看器已打开
    if (mediaViewer.style.display === 'flex') {
        switch (e.key) {
            case 'Escape':
                closeMediaViewer();
                break;
            case 'ArrowLeft':
                showPreviousMedia();
                break;
            case 'ArrowRight':
                showNextMedia();
                break;
        }
    }
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString.replace(/\//g, '-'));
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// 切换收藏状态
function toggleFavorite(mediaId) {
    const mediaIndex = mediaData.findIndex(m => m.id === mediaId);
    if (mediaIndex !== -1) {
        const wasFavorite = mediaData[mediaIndex].favorite;
        mediaData[mediaIndex].favorite = !wasFavorite;
        
        // 更新UI
        updateFavoriteUI(mediaId);
        
        // 保存到本地存储
        saveFavoritesToStorage();
        
        // 如果当前在收藏视图，需要更新显示
        const activeType = document.querySelector('.sidebar-item.active').getAttribute('data-type');
        if (activeType === 'favorites') {
            // 如果是取消收藏，从当前视图中移除该项
            if (wasFavorite) {
                const mediaItem = document.querySelector(`.media-item[data-id="${mediaId}"]`);
                if (mediaItem) {
                    const dateSection = mediaItem.closest('.date-section');
                    mediaItem.remove();
                    
                    // 如果该日期分组下没有其他媒体项，移除整个分组
                    if (dateSection && !dateSection.querySelector('.media-item')) {
                        dateSection.remove();
                    }
                }
            }
        }
    }
}

// 更新收藏UI
function updateFavoriteUI(mediaId) {
    // 更新网格视图中的收藏按钮
    const gridFavoriteBtn = document.querySelector(`.media-item[data-id="${mediaId}"] .favorite-btn .material-symbols-outlined`);
    if (gridFavoriteBtn) {
        const isFavorite = mediaData.find(m => m.id === mediaId)?.favorite;
        gridFavoriteBtn.textContent = isFavorite ? 'favorite' : 'favorite_border';
        gridFavoriteBtn.style.color = isFavorite ? '#ff4081' : 'inherit';
    }
    
    // 更新查看器中的收藏按钮
    if (mediaViewer.style.display === 'flex') {
        const viewerFavoriteBtn = document.querySelector('.viewer-favorite-btn .material-symbols-outlined');
        if (viewerFavoriteBtn && mediaData[currentMediaIndex].id === mediaId) {
            const isFavorite = mediaData[currentMediaIndex].favorite;
            viewerFavoriteBtn.textContent = isFavorite ? 'favorite' : 'favorite_border';
            viewerFavoriteBtn.style.color = isFavorite ? '#ff4081' : 'inherit';
        }
    }
}

// 保存收藏状态到本地存储
function saveFavoritesToStorage() {
    const favorites = mediaData.filter(media => media.favorite).map(media => media.id);
    localStorage.setItem('mediaFavorites', JSON.stringify(favorites));
}

// 从本地存储加载收藏状态
function loadFavoritesFromStorage() {
    try {
        const favorites = JSON.parse(localStorage.getItem('mediaFavorites')) || [];
        mediaData.forEach(media => {
            media.favorite = favorites.includes(media.id);
        });
    } catch (err) {
        console.error('加载收藏数据失败:', err);
    }
}

// 创建媒体缩略图
function createMediaThumbnail(media) {
    const mediaItem = document.createElement('div');
    mediaItem.className = 'media-item';
    mediaItem.setAttribute('data-type', media.type);
    mediaItem.setAttribute('data-id', media.id);
    
    // 创建缩略图容器
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'media-thumbnail';
    
    // 创建缩略图
    const img = document.createElement('img');
    img.src = media.thumbnail || media.src;
    img.alt = media.type === 'photo' ? '照片' : '视频';
    thumbnailContainer.appendChild(img);
    
    // 如果是视频，添加视频指示器
    if (media.type === 'video') {
        const videoIndicator = document.createElement('div');
        videoIndicator.className = 'video-indicator';
        const playIcon = document.createElement('span');
        playIcon.className = 'material-symbols-outlined';
        playIcon.textContent = 'play_arrow';
        videoIndicator.appendChild(playIcon);
        thumbnailContainer.appendChild(videoIndicator);
        
        if (media.duration) {
            const duration = document.createElement('div');
            duration.className = 'video-duration';
            duration.textContent = media.duration;
            thumbnailContainer.appendChild(duration);
        }
    }
    
    mediaItem.appendChild(thumbnailContainer);
    
    // 创建覆盖层
    const overlay = document.createElement('div');
    overlay.className = 'media-overlay';
    
    // 添加日期
    const date = document.createElement('div');
    date.className = 'media-date';
    date.textContent = media.date;
    overlay.appendChild(date);
    
    // 添加操作按钮
    const actions = document.createElement('div');
    actions.className = 'media-actions';
    
    // 收藏按钮
    const favoriteBtn = document.createElement('button');
    favoriteBtn.className = 'action-btn favorite-btn';
    favoriteBtn.title = '收藏';
    const favoriteIcon = document.createElement('span');
    favoriteIcon.className = 'material-symbols-outlined';
    favoriteIcon.textContent = media.favorite ? 'favorite' : 'favorite_border';
    favoriteIcon.style.color = media.favorite ? '#ff4081' : 'inherit';
    favoriteBtn.appendChild(favoriteIcon);
    favoriteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(media.id);
    });
    actions.appendChild(favoriteBtn);
    
    // 删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete-btn';
    deleteBtn.title = '删除';
    const deleteIcon = document.createElement('span');
    deleteIcon.className = 'material-symbols-outlined';
    deleteIcon.textContent = 'delete';
    deleteBtn.appendChild(deleteIcon);
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMedia(media.id);
    });
    actions.appendChild(deleteBtn);
    
    overlay.appendChild(actions);
    mediaItem.appendChild(overlay);
    
    // 添加点击事件
    mediaItem.addEventListener('click', () => {
        openMediaViewer(mediaData.indexOf(media), media.type);
    });
    
    return mediaItem;
}

// 删除媒体
async function deleteMedia(mediaId) {
    // 添加确认对话框
    if (!confirm('确定要删除这个文件吗？此操作不可恢复。')) {
        return; // 如果用户点击取消，直接返回
    }

    const mediaIndex = mediaData.findIndex(m => m.id === mediaId);
    if (mediaIndex !== -1) {
        const media = mediaData[mediaIndex];
        
        try {
            // 检查NW.js环境
            if (typeof nw !== 'undefined') {
                const fs = nw.require('fs').promises;
                
                // 删除文件
                await fs.unlink(media.src);
                console.log('文件删除成功:', media.src);
            }
            
            // 从数据中移除
            mediaData.splice(mediaIndex, 1);
            
            // 如果在媒体查看器中，需要处理查看器状态
            if (mediaViewer.style.display === 'flex') {
                if (mediaData.length === 0) {
                    // 如果没有媒体了，关闭查看器
                    closeMediaViewer();
                } else {
                    // 调整当前索引
                    if (currentMediaIndex >= mediaData.length) {
                        currentMediaIndex = mediaData.length - 1;
                    }
                    // 更新查看器显示
                    updateMediaViewer();
                }
            }
            
            // 从UI中移除
            const mediaItem = document.querySelector(`.media-item[data-id="${mediaId}"]`);
            if (mediaItem) {
                const dateSection = mediaItem.closest('.date-section');
                mediaItem.remove();
                
                // 如果该日期分组下没有其他媒体项，移除整个分组
                if (dateSection && !dateSection.querySelector('.media-item')) {
                    dateSection.remove();
                }
            }
            
            // 如果删除的是收藏的媒体，更新收藏状态
            if (media.favorite) {
                saveFavoritesToStorage();
            }
            
        } catch (err) {
            console.error('删除媒体失败:', err);
            alert('删除失败，请重试');
        }
    }
}

// 更新缩略图
function updateThumbnails() {
    const thumbnailsContainer = document.querySelector('.media-thumbnails');
    if (!thumbnailsContainer) return;

    // 清空现有缩略图
    thumbnailsContainer.innerHTML = '';

    // 获取当前媒体的前后各4张图片
    const start = Math.max(0, currentMediaIndex - 4);
    const end = Math.min(mediaData.length, currentMediaIndex + 5);

    // 创建并添加缩略图
    for (let i = start; i < end; i++) {
        const media = mediaData[i];
        const thumbnailItem = document.createElement('div');
        thumbnailItem.className = 'thumbnail-item';
        if (i === currentMediaIndex) {
            thumbnailItem.classList.add('active');
        }

        // 创建缩略图图片
        const img = document.createElement('img');
        img.src = media.thumbnail || media.src;
        img.alt = `缩略图${i + 1}`;
        thumbnailItem.appendChild(img);

        // 如果是视频，添加视频指示器
        if (media.type === 'video') {
            const videoIndicator = document.createElement('div');
            videoIndicator.className = 'thumbnail-video-indicator';
            thumbnailItem.appendChild(videoIndicator);
        }

        // 添加点击事件
        thumbnailItem.addEventListener('click', () => {
            currentMediaIndex = i;
            updateMediaViewer();
            updateThumbnailsScroll();
        });

        thumbnailsContainer.appendChild(thumbnailItem);
    }

    // 更新滚动位置
    updateThumbnailsScroll();
}

// 更新缩略图滚动位置
function updateThumbnailsScroll() {
    const thumbnailsContainer = document.querySelector('.media-thumbnails');
    const activeThumb = thumbnailsContainer.querySelector('.thumbnail-item.active');
    if (!activeThumb) return;

    // 计算滚动位置，使活动缩略图居中
    const containerWidth = thumbnailsContainer.offsetWidth;
    const thumbLeft = activeThumb.offsetLeft;
    const thumbWidth = activeThumb.offsetWidth;
    const scrollLeft = thumbLeft - (containerWidth / 2) + (thumbWidth / 2);

    // 平滑滚动到计算的位置
    thumbnailsContainer.scrollTo({
        left: scrollLeft,
        behavior: 'smooth'
    });
}

// 更新媒体信息
function updateMediaInfo(media) {
    const timestampElement = document.querySelector('.media-timestamp');
    const locationElement = document.querySelector('.media-location');

    if (timestampElement) {
        timestampElement.textContent = formatDate(media.date);
    }

    if (locationElement) {
        locationElement.textContent = media.location || '位置未知';
    }
}

// AI 功能处理
function initAITools() {
    // 获取 AI 工具按钮
    const aiToolBtns = document.querySelectorAll('.ai-tool-btn');
    const aiResultPanel = document.querySelector('.ai-result-panel');
    const aiPanelClose = document.querySelector('.ai-panel-close');
    const aiPanelTitle = document.querySelector('.ai-panel-title .ai-panel-text');
    const aiPanelIcon = document.querySelector('.ai-panel-title .ai-panel-icon');
    const aiPanelContent = document.querySelector('.ai-panel-content');
    const aiCancelBtn = document.querySelector('.ai-panel-footer .ai-action-btn:not(.primary)');
    const aiApplyBtn = document.querySelector('.ai-panel-footer .ai-action-btn.primary');
    
    // 工具类型映射
    const toolInfo = {
        'ocr': { title: '文字识别', icon: 'text_format' },
        'translate': { title: '双语翻译', icon: 'translate' },
        'understand': { title: '图片理解', icon: 'psychology' },
        'tags': { title: '生成标签', icon: 'tag' },
        'enhance': { title: '图像增强', icon: 'auto_fix_high' },
        'autocrop': { title: '自动裁剪', icon: 'crop' },
        'manualcrop': { title: '手动裁剪', icon: 'crop_free' },
        'rotateleft': { title: '向左旋转', icon: 'rotate_left' },
        'rotateright': { title: '向右旋转', icon: 'rotate_right' },
        'undo': { title: '撤销', icon: 'undo' }
    };
    
    // 关闭面板
    function closeAIPanel() {
        // 清理所有与图像校正相关的事件监听器
        if (window.correctEventListeners) {
            window.correctEventListeners.forEach(listener => {
                document.removeEventListener(listener.type, listener.fn);
            });
            window.correctEventListeners = [];
        }
        
        // 重置图像校正状态
        if (window.cropArea) {
            window.cropArea = null;
        }
        
        // 移除面板活动状态
        aiResultPanel.classList.remove('active');
    }
    
    // 显示加载状态
    function showLoading() {
        aiPanelContent.innerHTML = `
            <div class="ai-loading">
                <div class="ai-loading-spinner"></div>
                <div class="ai-loading-text">正在处理...</div>
            </div>
        `;
    }
    
    // 添加工具按钮点击事件
    aiToolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const toolType = btn.getAttribute('data-tool');
            const tool = toolInfo[toolType];
            
            // 处理撤销操作
            if (toolType === 'undo') {
                performUndo();
                return;
            }
            
            // 执行旋转操作，无需打开面板
            if (toolType === 'rotateleft' || toolType === 'rotateright') {
                performRotation(toolType === 'rotateleft' ? -90 : 90);
                return;
            }
            
            // 执行自动裁剪，无需打开面板
            if (toolType === 'autocrop') {
                performAutoCrop();
                return;
            }
            
            // 执行手动裁剪，无需打开面板
            if (toolType === 'manualcrop') {
                performManualCrop();
                return;
            }
            
            // 更新面板标题和图标
            aiPanelTitle.textContent = tool.title;
            aiPanelIcon.textContent = tool.icon;
            
            // 显示AI结果面板
            aiResultPanel.classList.add('active');
            
            // 显示加载状态
            showLoading();
            
            // 模拟AI处理
            setTimeout(() => {
                // 根据工具类型显示不同的示例内容
                switch(toolType) {
                    case 'ocr':
                        showOCRResult();
                        break;
                    case 'translate':
                        showTranslateResult();
                        break;
                    case 'understand':
                        showUnderstandResult();
                        break;
                    case 'tags':
                        showTagsResult();
                        break;
                    case 'enhance':
                        showEnhanceResult();
                        break;
                }
            }, 1500); // 模拟处理时间
        });
    });
    
    // 立即执行旋转操作
    function performRotation(angle) {
        // 获取当前图像元素
        const currentImage = document.getElementById('current-image');
        if (!currentImage) return;
        
        // 保存原始图像源用于处理
        const originalSrc = currentImage.src;
        
        // 创建临时canvas进行图像处理
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // 创建新图像对象，以确保图像已完全加载
        const img = new Image();
        img.onload = async function() {
            // 根据旋转角度设置画布尺寸
            if (Math.abs(angle) === 90 || Math.abs(angle) === 270) {
                tempCanvas.width = img.naturalHeight;
                tempCanvas.height = img.naturalWidth;
            } else {
                tempCanvas.width = img.naturalWidth;
                tempCanvas.height = img.naturalHeight;
            }
            
            // 执行旋转
            tempCtx.save();
            tempCtx.translate(tempCanvas.width/2, tempCanvas.height/2);
            tempCtx.rotate(angle * Math.PI / 180);
            tempCtx.drawImage(img, -img.naturalWidth/2, -img.naturalHeight/2);
            tempCtx.restore();
            
            // 更新图像
            const dataURL = tempCanvas.toDataURL('image/jpeg', 0.95);
            currentImage.src = dataURL;
            
            // 更新媒体数据
            if (mediaData[currentMediaIndex]) {
                const originalFilePath = mediaData[currentMediaIndex].src;
                
                // 保存到原始文件路径
                const saveSuccess = await saveDataURLToFile(dataURL, originalFilePath);
                
                if (saveSuccess) {
                    // 更新媒体数据
                    mediaData[currentMediaIndex].src = originalFilePath;
                    // 更新原始源，以便下次编辑使用新的状态
                    window.originalMediaSrc = dataURL;
                    
                    // 更新媒体缩略图
                    mediaData[currentMediaIndex].thumbnail = dataURL;
                    
                    // 更新底部预览区域
                    updateThumbnails();
                    
                    // 显示成功通知
                    showNotification(`旋转${angle}度已保存到原文件`);
                } else {
                    // 保存失败，仅更新内存中的图像
                    mediaData[currentMediaIndex].src = dataURL;
                    window.originalMediaSrc = dataURL;
                    mediaData[currentMediaIndex].thumbnail = dataURL;
                    updateThumbnails();
                    
                    // 显示失败通知
                    showNotification('无法保存到原文件，已更新界面显示', true);
                }
            }
        };
        
        // 加载图像
        img.src = originalSrc;
    }
    
    // 执行自动裁剪
    function performAutoCrop() {
        // 获取当前图像元素
        const currentImage = document.getElementById('current-image');
        if (!currentImage) return;
        
        // 保存原始图像源用于处理和撤销
        const originalSrc = currentImage.src;
        
        // 将原始状态保存到全局变量，用于撤销操作
        window.originalMediaSrc = originalSrc;
        
        // 创建临时canvas进行图像处理
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // 创建新图像对象，以确保图像已完全加载
        const img = new Image();
        img.onload = function() {
            tempCanvas.width = img.naturalWidth;
            tempCanvas.height = img.naturalHeight;
            tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
            
            // 执行自动裁剪
            applyAutoCrop(tempCanvas, async function(croppedDataURL) {
                if (croppedDataURL) {
                    // 更新图像
                    currentImage.src = croppedDataURL;
                    
                    // 更新媒体数据
                    if (mediaData[currentMediaIndex]) {
                        const originalFilePath = mediaData[currentMediaIndex].src;
                        
                        // 保存到原始文件路径
                        const saveSuccess = await saveDataURLToFile(croppedDataURL, originalFilePath);
                        
                        if (saveSuccess) {
                            // 更新媒体数据
                            mediaData[currentMediaIndex].src = originalFilePath;
                            // 更新原始源，以便下次编辑使用新的状态
                            // window.originalMediaSrc = croppedDataURL; // 注释掉这行，保留原始状态用于撤销
                            
                            // 更新媒体缩略图
                            mediaData[currentMediaIndex].thumbnail = croppedDataURL;
                            
                            // 更新底部预览区域
                            updateThumbnails();
                            
                            // 显示成功通知
                            showNotification('自动裁剪已保存到原文件');
                        } else {
                            // 保存失败，仅更新内存中的图像
                            mediaData[currentMediaIndex].src = croppedDataURL;
                            // window.originalMediaSrc = croppedDataURL; // 注释掉这行，保留原始状态用于撤销
                            mediaData[currentMediaIndex].thumbnail = croppedDataURL;
                            updateThumbnails();
                            
                            // 显示失败通知
                            showNotification('无法保存到原文件，已更新界面显示', true);
                        }
                        
                        // 启用撤销按钮
                        enableUndoButton();
                    }
                }
            });
        };
        
        // 加载图像
        img.src = originalSrc;
    }
    
    // 执行手动裁剪直接在图像上
    function performManualCrop() {
        // 获取当前图像元素
        const currentImage = document.getElementById('current-image');
        if (!currentImage || currentImage.style.display === 'none') {
            alert('请先选择一张图片');
            return;
        }
        
        // 保存当前媒体图像的原始源，以便重置
        window.originalMediaSrc = currentImage.src;
        
        // 获取媒体显示区域
        const mediaDisplay = document.querySelector('.media-display');
        if (!mediaDisplay) return;
        
        // 禁用图像的拖动功能
        disableImageDrag();
        
        // 创建裁剪控件容器
        let cropControls = document.querySelector('.crop-controls');
        if (!cropControls) {
            cropControls = document.createElement('div');
            cropControls.className = 'crop-controls';
            cropControls.innerHTML = `
                <div class="crop-area">
                    <div class="crop-border"></div>
                    <div class="crop-handle tl"></div>
                    <div class="crop-handle tr"></div>
                    <div class="crop-handle bl"></div>
                    <div class="crop-handle br"></div>
                </div>
                <div class="crop-actions">
                    <button class="crop-action-btn crop-cancel">取消</button>
                    <button class="crop-action-btn crop-apply">应用</button>
                </div>
            `;
            mediaDisplay.appendChild(cropControls);
            
            // 添加基本样式
            const style = document.createElement('style');
            style.textContent = `
                .media-display { position: relative; }
                .crop-controls { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 100; }
                .crop-area { position: absolute; border: 2px dashed rgba(255, 255, 255, 0.8); box-sizing: border-box; cursor: move; }
                .crop-border { position: absolute; top: 0; left: 0; right: 0; bottom: 0; border: 1px solid rgba(0, 0, 0, 0.5); }
                .crop-handle { position: absolute; width: 12px; height: 12px; background: #fff; border: 1px solid #000; }
                .crop-handle.tl { top: -6px; left: -6px; cursor: nw-resize; }
                .crop-handle.tr { top: -6px; right: -6px; cursor: ne-resize; }
                .crop-handle.bl { bottom: -6px; left: -6px; cursor: sw-resize; }
                .crop-handle.br { bottom: -6px; right: -6px; cursor: se-resize; }
                .crop-actions { position: absolute; bottom: 20px; left: 0; width: 100%; display: flex; justify-content: center; gap: 10px; }
                .crop-action-btn { padding: 8px 16px; background: rgba(0, 0, 0, 0.7); color: white; border: none; border-radius: 4px; cursor: pointer; }
                .crop-action-btn:hover { background: rgba(0, 0, 0, 0.85); }
                /* 禁用裁剪模式下的图像拖动 */
                .cropping-active #current-image { pointer-events: none !important; user-select: none !important; }
            `;
            document.head.appendChild(style);
        } else {
            // 如果已经存在，则显示
            cropControls.style.display = 'block';
        }
        
        // 获取裁剪区域元素
        const cropArea = document.querySelector('.crop-area');
        if (!cropArea) return;
        
        // 获取确认和取消按钮
        const cropCancelBtn = document.querySelector('.crop-cancel');
        const cropApplyBtn = document.querySelector('.crop-apply');
        
        // 初始化裁剪区域
        initCropArea(cropArea, currentImage, mediaDisplay);
        
        // 重置状态变量
        let isDragging = false;
        let isResizing = false;
        let startX, startY;
        let currentHandle;
        
        // 裁剪区域拖拽
        cropArea.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('crop-handle')) {
                // 调整大小
                isResizing = true;
                currentHandle = e.target;
            } else {
                // 移动整个区域
                isDragging = true;
            }
            startX = e.clientX;
            startY = e.clientY;
            e.preventDefault(); // 防止拖动图片
            e.stopPropagation(); // 阻止事件冒泡到图像
        });
        
        // 创建移动和调整大小处理函数
        const handleMouseMove = (e) => {
            if (!isDragging && !isResizing) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            const cropRect = cropArea.getBoundingClientRect();
            const wrapperRect = mediaDisplay.getBoundingClientRect();
            
            if (isResizing) {
                // 调整裁剪区域大小
                const isLeft = currentHandle.classList.contains('tl') || currentHandle.classList.contains('bl');
                const isTop = currentHandle.classList.contains('tl') || currentHandle.classList.contains('tr');
                
                if (isLeft) {
                    const newWidth = cropRect.width - deltaX;
                    if (newWidth > 50) {
                        const newLeft = (cropRect.left - wrapperRect.left + deltaX);
                        cropArea.style.width = newWidth + 'px';
                        cropArea.style.left = newLeft + 'px';
                        
                        // 更新数据属性
                        cropArea.dataset.cropWidth = newWidth;
                        cropArea.dataset.cropLeft = newLeft;
                    }
                } else {
                    const newWidth = cropRect.width + deltaX;
                    if (newWidth > 50) {
                        cropArea.style.width = newWidth + 'px';
                        
                        // 更新数据属性
                        cropArea.dataset.cropWidth = newWidth;
                    }
                }
                
                if (isTop) {
                    const newHeight = cropRect.height - deltaY;
                    if (newHeight > 50) {
                        const newTop = (cropRect.top - wrapperRect.top + deltaY);
                        cropArea.style.height = newHeight + 'px';
                        cropArea.style.top = newTop + 'px';
                        
                        // 更新数据属性
                        cropArea.dataset.cropHeight = newHeight;
                        cropArea.dataset.cropTop = newTop;
                    }
                } else {
                    const newHeight = cropRect.height + deltaY;
                    if (newHeight > 50) {
                        cropArea.style.height = newHeight + 'px';
                        
                        // 更新数据属性
                        cropArea.dataset.cropHeight = newHeight;
                    }
                }
            } else {
                // 移动裁剪区域
                const newLeft = cropRect.left - wrapperRect.left + deltaX;
                const newTop = cropRect.top - wrapperRect.top + deltaY;
                
                if (newLeft >= 0 && newLeft + cropRect.width <= wrapperRect.width) {
                    cropArea.style.left = newLeft + 'px';
                    
                    // 更新数据属性
                    cropArea.dataset.cropLeft = newLeft;
                }
                if (newTop >= 0 && newTop + cropRect.height <= wrapperRect.height) {
                    cropArea.style.top = newTop + 'px';
                    
                    // 更新数据属性
                    cropArea.dataset.cropTop = newTop;
                }
            }
            
            startX = e.clientX;
            startY = e.clientY;
            
            // 阻止事件传播，避免图像拖动
            e.preventDefault();
            e.stopPropagation();
        };
        
        const handleMouseUp = () => {
            isDragging = false;
            isResizing = false;
            currentHandle = null;
        };
        
        // 添加事件监听器
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // 保存事件监听器引用，便于后续清理
        window.cropEventListeners = [
            { element: document, type: 'mousemove', fn: handleMouseMove },
            { element: document, type: 'mouseup', fn: handleMouseUp }
        ];
        
        // 取消裁剪
        cropCancelBtn.addEventListener('click', () => {
            // 重置图像到原始状态
            currentImage.src = window.originalMediaSrc;
            
            // 隐藏裁剪控件
            cropControls.style.display = 'none';
            
            // 移除事件监听器
            cleanupCropEventListeners();
            
            // 恢复图像拖动功能
            enableImageDrag();
        });
        
        // 应用裁剪
        cropApplyBtn.addEventListener('click', () => {
            // 显示加载提示
            showLoading();
            
            // 应用裁剪，并通过回调函数处理完成后的事件
            applyCropToImage(cropArea, currentImage, mediaDisplay, () => {
                // 隐藏裁剪控件
                cropControls.style.display = 'none';
                
                // 移除事件监听器
                cleanupCropEventListeners();
                
                // 隐藏加载提示
                hideLoading();
                
                // 恢复图像拖动功能
                enableImageDrag();
            });
        });
    }
    
    // 禁用图像拖动功能
    function disableImageDrag() {
        // 添加标记类来触发CSS规则
        document.querySelector('.media-display').classList.add('cropping-active');
        
        // 如果存在PanZoom实例，暂时禁用它
        if (panzoomInstance) {
            // 保存当前状态
            window.savedPanzoomState = {
                enabled: true,
                scale: panzoomInstance.getScale(),
                pan: panzoomInstance.getPan()
            };
            
            // 禁用PanZoom
            panzoomInstance.pause();
        }
        
        // 禁用全局拖动变量
        window.savedDragState = isDragging;
        isDragging = false;
        
        console.log('图像拖动功能已禁用');
    }
    
    // 恢复图像拖动功能
    function enableImageDrag() {
        // 移除标记类
        const mediaDisplay = document.querySelector('.media-display');
        if (mediaDisplay) {
            mediaDisplay.classList.remove('cropping-active');
        }
        
        // 如果存在保存的PanZoom状态，恢复它
        if (window.savedPanzoomState && window.savedPanzoomState.enabled && panzoomInstance) {
            panzoomInstance.resume();
            
            // 可选：恢复缩放和平移状态
            // panzoomInstance.zoomAbs(0, 0, window.savedPanzoomState.scale);
            // panzoomInstance.pan(window.savedPanzoomState.pan.x, window.savedPanzoomState.pan.y);
            
            // 清理保存的状态
            window.savedPanzoomState = null;
        }
        
        // 恢复全局拖动变量
        if (window.savedDragState !== undefined) {
            isDragging = window.savedDragState;
            window.savedDragState = undefined;
        }
        
        // 只在调试时输出日志，避免频繁日志
        if (window.isDebugMode) {
            console.log('图像拖动功能已恢复');
        }
    }
    
    // 清理裁剪相关的事件监听器
    function cleanupCropEventListeners() {
        if (window.cropEventListeners) {
            window.cropEventListeners.forEach(listener => {
                listener.element.removeEventListener(listener.type, listener.fn);
            });
            window.cropEventListeners = [];
        }
    }
    
    // 初始化裁剪区域
    function initCropArea(cropArea, imageElement, container) {
        if (!cropArea || !imageElement || !container) {
            console.error('初始化裁剪区域失败：缺少必要元素');
            return;
        }
        
        // 获取图像和容器的尺寸
        const imgRect = imageElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // 计算图像在容器中的位置
        const imgLeft = imgRect.left - containerRect.left;
        const imgTop = imgRect.top - containerRect.top;
        const imgWidth = imgRect.width;
        const imgHeight = imgRect.height;
        
        // 设置裁剪区域初始尺寸为图像的60%，居中显示
        const cropWidth = imgWidth * 0.6;
        const cropHeight = imgHeight * 0.6;
        const cropLeft = imgLeft + (imgWidth - cropWidth) / 2;
        const cropTop = imgTop + (imgHeight - cropHeight) / 2;
        
        // 应用裁剪区域样式
        cropArea.style.left = cropLeft + 'px';
        cropArea.style.top = cropTop + 'px';
        cropArea.style.width = cropWidth + 'px';
        cropArea.style.height = cropHeight + 'px';
        
        // 保存初始值到dataset以便后续使用
        cropArea.dataset.cropLeft = cropLeft;
        cropArea.dataset.cropTop = cropTop;
        cropArea.dataset.cropWidth = cropWidth;
        cropArea.dataset.cropHeight = cropHeight;
        
        // 保存图像信息
        imageElement.dataset.displayWidth = imgWidth;
        imageElement.dataset.displayHeight = imgHeight;
        
        console.log('初始化裁剪区域:', {
            cropLeft, cropTop, cropWidth, cropHeight,
            imgLeft, imgTop, imgWidth, imgHeight
        });
    }
    
    // 应用裁剪到图像
    function applyCropToImage(cropArea, imageElement, container, callback) {
        // 检查是否正在处理裁剪，防止重复处理
        if (window.isProcessingCrop) {
            console.log('正在处理裁剪，请稍候...');
            return;
        }
        
        // 设置裁剪处理标志
        window.isProcessingCrop = true;
        console.log('正在处理裁剪');
        
        // 添加安全超时，确保即使在图像加载失败的情况下也会重置标志
        const safetyTimeout = setTimeout(() => {
            if (window.isProcessingCrop) {
                console.warn('裁剪处理超时，重置处理状态');
                window.isProcessingCrop = false;
                if (callback) callback(false);
                showNotification('裁剪操作超时，请重试', true);
            }
        }, 15000); // 15秒超时
        
        try {
            // 创建临时canvas
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            // 创建新图像对象，以确保图像已完全加载
            const img = new Image();
            img.onload = async function() {
                try {
                    // 设置canvas尺寸为原始图像尺寸
                    tempCanvas.width = img.naturalWidth;
                    tempCanvas.height = img.naturalHeight;
                    
                    // 先绘制原始图像
                    tempCtx.drawImage(img, 0, 0);
                    
                    // 获取裁剪区域和容器的尺寸
                    const cropRect = cropArea.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    const imgRect = imageElement.getBoundingClientRect();
                    
                    // 计算裁剪区域相对于图像的比例
                    const relativeLeft = (cropRect.left - imgRect.left) / imgRect.width;
                    const relativeTop = (cropRect.top - imgRect.top) / imgRect.height;
                    const relativeWidth = cropRect.width / imgRect.width;
                    const relativeHeight = cropRect.height / imgRect.height;
                    
                    // 确保裁剪区域在有效范围内
                    const boundedRelativeLeft = Math.max(0, Math.min(1, relativeLeft));
                    const boundedRelativeTop = Math.max(0, Math.min(1, relativeTop));
                    const boundedRelativeWidth = Math.min(relativeWidth, 1 - boundedRelativeLeft);
                    const boundedRelativeHeight = Math.min(relativeHeight, 1 - boundedRelativeTop);
                    
                    // 计算原始图像上的裁剪区域（像素坐标）
                    const cropX = Math.floor(boundedRelativeLeft * tempCanvas.width);
                    const cropY = Math.floor(boundedRelativeTop * tempCanvas.height);
                    const cropWidth = Math.ceil(boundedRelativeWidth * tempCanvas.width);
                    const cropHeight = Math.ceil(boundedRelativeHeight * tempCanvas.height);
                    
                    // 减小最小尺寸阈值，使裁剪更容易成功
                    const MIN_SIZE_PERCENT = 0.01; // 降低至图像尺寸的1%
                    const absoluteMinSize = 5; // 降低绝对最小值为5像素
                    const minWidth = Math.max(absoluteMinSize, tempCanvas.width * MIN_SIZE_PERCENT);
                    const minHeight = Math.max(absoluteMinSize, tempCanvas.height * MIN_SIZE_PERCENT);
                    
                    // 验证裁剪尺寸
                    if (cropWidth < minWidth || cropHeight < minHeight) {
                        console.error('裁剪区域过小:', {cropWidth, cropHeight, minWidth, minHeight});
                        // 使用最小允许尺寸进行裁剪，而不是直接失败
                        const finalCropWidth = Math.max(cropWidth, minWidth);
                        const finalCropHeight = Math.max(cropHeight, minHeight);
                        
                        // 输出调整后的尺寸
                        console.log('已调整裁剪尺寸到最小允许值:', {finalCropWidth, finalCropHeight});
                        
                        // 执行裁剪 - 使用调整后的尺寸
                        const croppedCanvas = document.createElement('canvas');
                        croppedCanvas.width = finalCropWidth;
                        croppedCanvas.height = finalCropHeight;
                        const croppedCtx = croppedCanvas.getContext('2d');
                        
                        croppedCtx.drawImage(tempCanvas,
                            cropX, cropY, finalCropWidth, finalCropHeight,
                            0, 0, finalCropWidth, finalCropHeight);
                            
                        // 更新图像
                        const dataURL = croppedCanvas.toDataURL('image/jpeg', 0.95);
                        imageElement.src = dataURL;
                        
                        // 更新媒体数据
                        if (mediaData[currentMediaIndex]) {
                            const originalFilePath = mediaData[currentMediaIndex].src;
                            
                            // 保存到原始文件路径
                            const saveSuccess = await saveDataURLToFile(dataURL, originalFilePath);
                            
                            if (saveSuccess) {
                                // 更新媒体数据
                                mediaData[currentMediaIndex].src = originalFilePath;
                                // 更新原始源，以便下次编辑使用新的状态
                                window.originalMediaSrc = dataURL;
                                
                                // 更新媒体缩略图
                                mediaData[currentMediaIndex].thumbnail = dataURL;
                                
                                // 更新底部预览区域
                                updateThumbnails();
                                
                                // 显示成功通知
                                showNotification('裁剪已调整至最小尺寸并保存');
                            } else {
                                // 保存失败，仅更新内存中的图像
                                mediaData[currentMediaIndex].src = dataURL;
                                window.originalMediaSrc = dataURL;
                                mediaData[currentMediaIndex].thumbnail = dataURL;
                                updateThumbnails();
                                
                                // 显示失败通知
                                showNotification('无法保存到原文件，已更新界面显示', true);
                            }
                        }
                    } else {
                        console.log('裁剪参数:', {
                            cropX, cropY, cropWidth, cropHeight,
                            originalSize: { width: tempCanvas.width, height: tempCanvas.height },
                            minRequiredSize: { width: minWidth, height: minHeight }
                        });
                        
                        // 执行裁剪
                        const croppedCanvas = document.createElement('canvas');
                        croppedCanvas.width = cropWidth;
                        croppedCanvas.height = cropHeight;
                        const croppedCtx = croppedCanvas.getContext('2d');
                        
                        croppedCtx.drawImage(tempCanvas,
                            cropX, cropY, cropWidth, cropHeight,
                            0, 0, cropWidth, cropHeight);
                        
                        // 更新图像
                        const dataURL = croppedCanvas.toDataURL('image/jpeg', 0.95);
                        imageElement.src = dataURL;
                        
                        // 更新媒体数据
                        if (mediaData[currentMediaIndex]) {
                            const originalFilePath = mediaData[currentMediaIndex].src;
                            
                            // 保存到原始文件路径
                            const saveSuccess = await saveDataURLToFile(dataURL, originalFilePath);
                            
                            if (saveSuccess) {
                                // 更新媒体数据
                                mediaData[currentMediaIndex].src = originalFilePath;
                                // 更新原始源，以便下次编辑使用新的状态
                                window.originalMediaSrc = dataURL;
                                
                                // 更新媒体缩略图
                                mediaData[currentMediaIndex].thumbnail = dataURL;
                                
                                // 更新底部预览区域
                                updateThumbnails();
                                
                                // 显示成功通知
                                showNotification('手动裁剪已保存到原文件');
                            } else {
                                // 保存失败，仅更新内存中的图像
                                mediaData[currentMediaIndex].src = dataURL;
                                window.originalMediaSrc = dataURL;
                                mediaData[currentMediaIndex].thumbnail = dataURL;
                                updateThumbnails();
                                
                                // 显示失败通知
                                showNotification('无法保存到原文件，已更新界面显示', true);
                            }
                        }
                    }
                    
                    // 处理成功
                    if (callback) callback(true);
                    
                } catch (error) {
                    console.error('裁剪过程中发生错误:', error);
                    showNotification('裁剪过程中出错，请重试', true);
                    if (callback) callback(false);
                } finally {
                    // 清除安全超时
                    clearTimeout(safetyTimeout);
                    // 重置处理标志
                    window.isProcessingCrop = false;
                }
            };
            
            img.onerror = function() {
                console.error('裁剪图像加载失败');
                clearTimeout(safetyTimeout);
                window.isProcessingCrop = false;
                showNotification('图像加载失败，请重试', true);
                if (callback) callback(false);
            };
            
            // 确保使用当前原始图像作为源
            img.src = window.originalMediaSrc;
            
        } catch (e) {
            console.error('准备裁剪过程中出错:', e);
            clearTimeout(safetyTimeout);
            window.isProcessingCrop = false;
            showNotification('裁剪准备过程中出错，请重试', true);
            if (callback) callback(false);
        }
    }
    
    // 关闭按钮事件
    aiPanelClose.addEventListener('click', closeAIPanel);
    
    // 添加取消和应用按钮通用事件
    aiCancelBtn.addEventListener('click', closeAIPanel);
    
    // 文字识别结果示例
    function showOCRResult() {
        aiPanelContent.innerHTML = `
            <div class="ocr-result">
                <p>识别结果：</p>
                <div class="detected-text">
                    这是从图像中识别出的文本内容示例。这里将显示图像中的所有文字内容，包括各种语言和格式。
                </div>
                <p class="confidence-info">识别置信度：95%</p>
            </div>
        `;
    }
    
    // 双语翻译结果示例
    function showTranslateResult() {
        aiPanelContent.innerHTML = `
            <div class="translation-result">
                <div class="original-text">
                    <div class="translation-label">原文(中文):</div>
                    <p>这是一段中文示例文本，用于演示AI翻译功能。</p>
                </div>
                <div class="translated-text">
                    <div class="translation-label">译文(English):</div>
                    <p>This is a sample Chinese text for demonstrating AI translation functionality.</p>
                </div>
            </div>
            <div class="translation-options">
                <label>目标语言：</label>
                <select class="language-select">
                    <option value="en">英语</option>
                    <option value="ja">日语</option>
                    <option value="ko">韩语</option>
                    <option value="fr">法语</option>
                    <option value="de">德语</option>
                </select>
            </div>
        `;
    }
    
    // 图片理解结果示例
    function showUnderstandResult() {
        aiPanelContent.innerHTML = `
            <div class="understand-result">
                <h4>图像分析</h4>
                <p>这张图片展示了一个小型电子设备，可能是某种智能家居设备或电子配件，位于深色织物背景上。</p>
                <h4>场景分析</h4>
                <ul>
                    <li>室内场景 (99%)</li>
                    <li>特写镜头 (95%)</li>
                    <li>产品展示 (92%)</li>
                </ul>
                <h4>主要对象</h4>
                <ul>
                    <li>电子设备 (97%)</li>
                    <li>布料/织物 (90%)</li>
                </ul>
            </div>
        `;
    }
    
    // 标签生成结果示例
    function showTagsResult() {
        aiPanelContent.innerHTML = `
            <div class="tags-result">
                <p>为您的图像生成的标签：</p>
                <div class="ai-tags-container">
                    <div class="ai-tag">电子设备 <span class="confidence">98%</span></div>
                    <div class="ai-tag">智能家居 <span class="confidence">94%</span></div>
                    <div class="ai-tag">特写 <span class="confidence">92%</span></div>
                    <div class="ai-tag">室内 <span class="confidence">92%</span></div>
                    <div class="ai-tag">产品 <span class="confidence">89%</span></div>
                    <div class="ai-tag">现代科技 <span class="confidence">87%</span></div>
                    <div class="ai-tag">小工具 <span class="confidence">84%</span></div>
                    <div class="ai-tag">白色 <span class="confidence">82%</span></div>
                </div>
            </div>
        `;
    }
    
    // 从图片样式中提取滤镜值
    function extractFilterValue(filterStyle, filterName) {
        if (!filterStyle) return 100;
        const regex = new RegExp(`${filterName}\\((\\d+)%\\)`);
        const match = filterStyle.match(regex);
        return match ? parseInt(match[1]) : 100;
    }

    // 从模糊值转换为降噪值
    function blurToDenoiseValue(filterStyle) {
        if (!filterStyle) return 0;
        const regex = /blur\(([\d.]+)px\)/;
        const match = filterStyle.match(regex);
        return match ? Math.round(parseFloat(match[1]) * 50) : 0;
    }

    // 从对比度转换为锐化值
    function contrastToSharpnessValue(filterStyle) {
        if (!filterStyle) return 100;
        const regex = /contrast\((\d+)%\)/g;
        const matches = Array.from(filterStyle.matchAll(regex));
        if (matches.length >= 2) {
            const sharpnessContrast = parseInt(matches[1][1]);
            return Math.round(((sharpnessContrast - 100) * 2) + 100);
        }
        return 100;
    }

    // 图像增强结果示例
    function showEnhanceResult() {
        const currentImage = mediaData[currentMediaIndex];
        
        // 获取当前图片的滤镜样式
        const viewerImage = document.getElementById('current-image');
        const currentFilter = viewerImage.style.filter;
        
        // 从当前滤镜中提取各个值
        currentEnhanceValues = {
            brightness: extractFilterValue(currentFilter, 'brightness'),
            contrast: extractFilterValue(currentFilter, 'contrast'),
            sharpness: contrastToSharpnessValue(currentFilter),
            denoise: blurToDenoiseValue(currentFilter)
        };

        aiPanelContent.innerHTML = `
            <div class="enhance-result">
                <div class="enhance-preview">
                    <img src="${currentImage.src}" alt="增强预览" class="preview-image" id="enhance-preview"/>
                </div>
                <div class="enhance-options">
                    <div class="enhance-option">
                        <label>亮度 <span class="value-display">${currentEnhanceValues.brightness}%</span></label>
                        <input type="range" class="enhance-slider" data-type="brightness" min="0" max="200" value="${currentEnhanceValues.brightness}">
                    </div>
                    <div class="enhance-option">
                        <label>对比度 <span class="value-display">${currentEnhanceValues.contrast}%</span></label>
                        <input type="range" class="enhance-slider" data-type="contrast" min="0" max="200" value="${currentEnhanceValues.contrast}">
                    </div>
                    <div class="enhance-option">
                        <label>清晰度 <span class="value-display">${currentEnhanceValues.sharpness}%</span></label>
                        <input type="range" class="enhance-slider" data-type="sharpness" min="0" max="200" value="${currentEnhanceValues.sharpness}">
                    </div>
                    <div class="enhance-option">
                        <label>降噪 <span class="value-display">${currentEnhanceValues.denoise}%</span></label>
                        <input type="range" class="enhance-slider" data-type="denoise" min="0" max="100" value="${currentEnhanceValues.denoise}">
                    </div>
                </div>
            </div>
        `;

        // 获取预览图片元素
        const previewImage = document.getElementById('enhance-preview');
        
        // 保存原始样式
        originalImageStyle = currentFilter || 'none';
        
        // 应用当前滤镜效果到预览图
        if (currentFilter) {
            previewImage.style.filter = currentFilter;
        }
        
        // 添加滑块事件监听
        const sliders = aiPanelContent.querySelectorAll('.enhance-slider');
        sliders.forEach(slider => {
            slider.addEventListener('input', updateEnhancePreview);
        });
        
        // 修改面板底部按钮文本
        const cancelBtn = document.querySelector('.ai-panel-footer .ai-action-btn:not(.primary)');
        const applyBtn = document.querySelector('.ai-panel-footer .ai-action-btn.primary');
        cancelBtn.textContent = '取消';
        applyBtn.textContent = '应用';
        
        // 添加取消按钮事件
        cancelBtn.addEventListener('click', () => {
            closeAIPanel();
        });
        
        // 添加应用按钮事件
        applyBtn.addEventListener('click', () => {
            const currentImage = document.getElementById('current-image');
            const previewImage = aiPanelContent.querySelector('.preview-image');
            
            // 检查是否正在处理裁剪，防止重复处理
            if (window.isProcessingCrop) {
                console.log('正在处理裁剪，请稍候...');
                return;
            }
            
            // 设置裁剪处理标志
            window.isProcessingCrop = true;
            
            if (currentImage && previewImage) {
                try {
                    // 创建临时canvas
                    const tempCanvas = document.createElement('canvas');
                    const tempCtx = tempCanvas.getContext('2d');
                    
                    // 创建新图像对象，以确保图像已完全加载
                    const img = new Image();
                    img.onload = function() {
                        try {
                            // 使用标记变量跟踪是否使用了备选方案
                            let usedFallbackCrop = false;
                            
                            // 设置canvas尺寸为原始图像尺寸
                            tempCanvas.width = img.naturalWidth;
                            tempCanvas.height = img.naturalHeight;
                            
                            // 先绘制原始图像
                            tempCtx.drawImage(img, 0, 0);
                            
                            // ... existing code ...
                            
                            // 处理完成后重置标志
                            window.isProcessingCrop = false;
                            console.log('裁剪成功完成');
                        } catch (error) {
                            console.error('裁剪过程中发生错误:', error);
                            window.isProcessingCrop = false;
                        }
                    };
                    
                    img.onerror = function(error) {
                        console.error('加载裁剪图像失败:', error);
                        window.isProcessingCrop = false;
                    };
                    
                    // 确保使用当前最新的源
                    img.src = window.originalMediaSrc || mediaData[currentMediaIndex].src;
                    
                } catch (error) {
                    console.error('初始化裁剪过程失败:', error);
                    window.isProcessingCrop = false;
                }
            } else {
                console.error('无法找到当前图像或预览图像元素');
                window.isProcessingCrop = false;
            }
        });
    }
    
    // 更新增强预览
    function updateEnhancePreview(event) {
        const slider = event.target;
        const type = slider.getAttribute('data-type');
        const value = slider.value;
        const valueDisplay = slider.parentElement.querySelector('.value-display');
        valueDisplay.textContent = value + '%';
        
        // 更新当前值
        currentEnhanceValues[type] = parseInt(value);
        
        // 获取预览图片
        const previewImage = document.getElementById('enhance-preview');
        
        // 应用滤镜效果
        applyImageFilters(previewImage);
    }
    
    // 应用图像滤镜
    function applyImageFilters(image) {
        const { brightness, contrast, sharpness, denoise } = currentEnhanceValues;
        
        // 构建滤镜字符串
        const filters = [
            `brightness(${brightness}%)`,
            `contrast(${contrast}%)`,
            // 使用模糊和对比度组合模拟锐化效果
            `contrast(${100 + (sharpness - 100) * 0.5}%)`,
            // 使用模糊效果模拟降噪
            `blur(${denoise * 0.02}px)`
        ];
        
        // 应用滤镜
        image.style.filter = filters.join(' ');
    }
    
    // 图像矫正结果示例
    function showCorrectResult() {
        // 保存当前媒体图像的原始源，以便重置
        // 获取当前图像的真实源 - 直接使用current-image元素的当前src
        const currentImgElement = document.getElementById('current-image');
        window.originalMediaSrc = currentImgElement ? currentImgElement.src : mediaData[currentMediaIndex].src;
        
        aiPanelContent.innerHTML = `
            <div class="correct-result">
                <div class="preview-wrapper">
                    <img src="${window.originalMediaSrc}" alt="矫正预览" class="preview-image" />
                    <div class="correction-grid"></div>
                    <div class="crop-area" style="display: none;">
                        <div class="crop-border"></div>
                        <div class="crop-handle tl"></div>
                        <div class="crop-handle tr"></div>
                        <div class="crop-handle bl"></div>
                        <div class="crop-handle br"></div>
                    </div>
                </div>
                <div class="correct-options">
                    <div class="correct-option">
                        <label>旋转角度</label>
                        <div class="rotation-control">
                            <button class="rotate-btn" data-angle="-90">-90°</button>
                            <button class="rotate-btn" data-angle="-1">-1°</button>
                            <input type="number" class="angle-input" value="0" min="-180" max="180" step="1">
                            <button class="rotate-btn" data-angle="1">+1°</button>
                            <button class="rotate-btn" data-angle="90">+90°</button>
                        </div>
                    </div>
                    <div class="correct-option">
                        <label>裁剪选项</label>
                        <div class="crop-control">
                            <button class="crop-btn" id="auto-crop" data-crop="auto">自动裁剪</button>
                            <button class="crop-btn" id="manual-crop" data-crop="manual">手动裁剪</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 添加交互事件
        setTimeout(() => {
            // 获取预览图片元素
            const previewImage = aiPanelContent.querySelector('.preview-image');
            
            // 确保图像加载完成
            previewImage.onload = function() {
                console.log('图像校正预览加载完成，尺寸:', previewImage.naturalWidth, 'x', previewImage.naturalHeight);
            };
            
            previewImage.onerror = function() {
                console.error('图像校正预览加载失败');
                // 尝试使用原始媒体数据作为备用
                previewImage.src = mediaData[currentMediaIndex].src;
            };
            
            const previewWrapper = aiPanelContent.querySelector('.preview-wrapper');
            const cropArea = aiPanelContent.querySelector('.crop-area');
            const angleInput = aiPanelContent.querySelector('.angle-input');
            
            // 初始化事件监听器数组，如果不存在
            if (!window.correctEventListeners) {
                window.correctEventListeners = [];
        } else {
                // 清除之前的事件监听器
                window.correctEventListeners.forEach(listener => {
                    document.removeEventListener(listener.type, listener.fn);
                });
                window.correctEventListeners = [];
            }
            
            // 保存裁剪区域引用
            window.cropArea = cropArea;
        
        // 重置状态变量
            let currentRotation = 0;
            let isDragging = false;
            let isResizing = false;
            let startX, startY;
            let currentHandle;
            
            // 初始化裁剪区域
            function initCropArea() {
                // 直接使用外部已定义的cropArea和previewImage变量，而不是重新声明
                
                if (!cropArea || !previewImage) {
                    console.error('Crop area or preview image not found');
                    return;
                }
                
                // 获取预览图像的实际显示尺寸和位置
                previewImage.dataset.displayWidth = previewImage.offsetWidth || previewImage.clientWidth || previewImage.naturalWidth || 300;
                previewImage.dataset.displayHeight = previewImage.offsetHeight || previewImage.clientHeight || previewImage.naturalHeight || 200;
                
                // 调整裁剪区域大小 - 设置为图像尺寸的60%，但不超过图像本身
                const maxWidth = parseInt(previewImage.dataset.displayWidth);
                const maxHeight = parseInt(previewImage.dataset.displayHeight);
                
                // 计算居中的裁剪区域
                const cropWidth = Math.min(maxWidth * 0.6, maxWidth);
                const cropHeight = Math.min(maxHeight * 0.6, maxHeight);
                const cropLeft = (maxWidth - cropWidth) / 2;
                const cropTop = (maxHeight - cropHeight) / 2;

                // 应用计算得到的值
                cropArea.style.width = cropWidth + 'px';
                cropArea.style.height = cropHeight + 'px';
                cropArea.style.left = cropLeft + 'px';
                cropArea.style.top = cropTop + 'px';
                
                // 保存初始值到dataset以便后续使用
                cropArea.dataset.cropWidth = cropWidth;
                cropArea.dataset.cropHeight = cropHeight;
                cropArea.dataset.cropLeft = cropLeft;
                cropArea.dataset.cropTop = cropTop;
                
                console.log('初始化裁剪区域:', {
                    width: cropWidth, 
                    height: cropHeight, 
                    left: cropLeft, 
                    top: cropTop,
                    imageWidth: maxWidth,
                    imageHeight: maxHeight
                });
                
                // 显示裁剪区域
                cropArea.style.display = 'block';
            }
            
            // 旋转按钮事件
            const rotateButtons = aiPanelContent.querySelectorAll('.rotate-btn');
            rotateButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const angle = parseInt(btn.getAttribute('data-angle'));
                    currentRotation = (currentRotation + angle) % 360;
                    angleInput.value = currentRotation;
                    previewImage.style.transform = `rotate(${currentRotation}deg)`;
                });
            });
            
            // 角度输入事件
            angleInput.addEventListener('change', () => {
                currentRotation = parseInt(angleInput.value) || 0;
                currentRotation = Math.min(180, Math.max(-180, currentRotation));
                angleInput.value = currentRotation;
                previewImage.style.transform = `rotate(${currentRotation}deg)`;
            });
            
            // 裁剪按钮事件
            const cropButtons = aiPanelContent.querySelectorAll('.crop-btn');
            cropButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    cropButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    const cropMode = btn.getAttribute('data-crop');
                    if (cropMode === 'auto') {
                        cropArea.style.display = 'none';
                        const tempCanvas = document.createElement('canvas');
                        const tempCtx = tempCanvas.getContext('2d');
                        
                        // 使用原始图像源创建新图像并在加载完成后处理
                        const img = new Image();
                        img.onload = function() {
                            console.log('自动裁剪图像加载完成，尺寸:', img.naturalWidth, 'x', img.naturalHeight);
                            tempCanvas.width = img.naturalWidth;
                            tempCanvas.height = img.naturalHeight;
                            tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
                        applyAutoCropToPreview(tempCanvas, previewImage);
                        };
                        img.onerror = function() {
                            console.error('自动裁剪图像加载失败:', window.originalMediaSrc);
                        };
                        // 确保使用当前原始图像作为源
                        img.src = window.originalMediaSrc;
                        
                    } else if (cropMode === 'manual') {
                        // 重置预览图像和裁剪区域 - 使用保存的原始源
                        previewImage.src = window.originalMediaSrc;
                        previewImage.style.transform = 'none';
                        currentRotation = 0;
                        angleInput.value = 0;
                        
                        // 等待图像加载完成后初始化裁剪区域
                        previewImage.onload = function() {
                            console.log('手动裁剪图像加载完成:', previewImage.naturalWidth, 'x', previewImage.naturalHeight);
                        cropArea.style.display = 'block';
                        initCropArea();
                        };
                        
                        previewImage.onerror = function() {
                            console.error('手动裁剪图像加载失败');
                        };
                    }
                });
            });
            
            // 裁剪区域拖拽
            cropArea.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('crop-handle')) {
                    // 调整大小
                    isResizing = true;
                    currentHandle = e.target;
                } else {
                    // 移动整个区域
                    isDragging = true;
                }
                startX = e.clientX;
                startY = e.clientY;
            e.preventDefault(); // 防止拖动图片
            });
            
            // 使用具名函数，便于后续移除
        const handleMouseMove = (e) => {
                if (!isDragging && !isResizing) return;
                
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                const cropRect = cropArea.getBoundingClientRect();
                const wrapperRect = previewWrapper.getBoundingClientRect();
                
                if (isResizing) {
                    // 调整裁剪区域大小
                    const isLeft = currentHandle.classList.contains('tl') || currentHandle.classList.contains('bl');
                    const isTop = currentHandle.classList.contains('tl') || currentHandle.classList.contains('tr');
                    
                    if (isLeft) {
                        const newWidth = cropRect.width - deltaX;
                        if (newWidth > 50) {
                        const newLeft = (cropRect.left - wrapperRect.left + deltaX);
                            cropArea.style.width = newWidth + 'px';
                        cropArea.style.left = newLeft + 'px';
                        
                        // 更新数据属性
                        cropArea.dataset.cropWidth = newWidth;
                        cropArea.dataset.cropLeft = newLeft;
                        }
                    } else {
                        const newWidth = cropRect.width + deltaX;
                        if (newWidth > 50) {
                            cropArea.style.width = newWidth + 'px';
                        
                        // 更新数据属性
                        cropArea.dataset.cropWidth = newWidth;
                        }
                    }
                    
                    if (isTop) {
                        const newHeight = cropRect.height - deltaY;
                        if (newHeight > 50) {
                        const newTop = (cropRect.top - wrapperRect.top + deltaY);
                            cropArea.style.height = newHeight + 'px';
                        cropArea.style.top = newTop + 'px';
                        
                        // 更新数据属性
                        cropArea.dataset.cropHeight = newHeight;
                        cropArea.dataset.cropTop = newTop;
                        }
                    } else {
                        const newHeight = cropRect.height + deltaY;
                        if (newHeight > 50) {
                            cropArea.style.height = newHeight + 'px';
                        
                        // 更新数据属性
                        cropArea.dataset.cropHeight = newHeight;
                        }
                    }
                } else {
                    // 移动裁剪区域
                    const newLeft = cropRect.left - wrapperRect.left + deltaX;
                    const newTop = cropRect.top - wrapperRect.top + deltaY;
                    
                    if (newLeft >= 0 && newLeft + cropRect.width <= wrapperRect.width) {
                        cropArea.style.left = newLeft + 'px';
                    
                    // 更新数据属性
                    cropArea.dataset.cropLeft = newLeft;
                    }
                    if (newTop >= 0 && newTop + cropRect.height <= wrapperRect.height) {
                        cropArea.style.top = newTop + 'px';
                    
                    // 更新数据属性
                    cropArea.dataset.cropTop = newTop;
                    }
                }
                
                startX = e.clientX;
                startY = e.clientY;
        };
            
        const handleMouseUp = () => {
                isDragging = false;
                isResizing = false;
                currentHandle = null;
        };
        
            // 保存事件监听器引用，便于后续清理
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
            // 记录添加的事件监听器，便于后续清理
            window.correctEventListeners.push(
                { type: 'mousemove', fn: handleMouseMove },
                { type: 'mouseup', fn: handleMouseUp }
            );
            
            // 修改面板底部按钮文本
            const cancelBtn = document.querySelector('.ai-panel-footer .ai-action-btn:not(.primary)');
            const applyBtn = document.querySelector('.ai-panel-footer .ai-action-btn.primary');
            cancelBtn.textContent = '取消';
            applyBtn.textContent = '应用';
            
            // 添加取消按钮事件
            cancelBtn.addEventListener('click', () => {
                // 取消时恢复原始图像
                const currentImage = document.getElementById('current-image');
                if (currentImage && window.originalMediaSrc) {
                    currentImage.src = window.originalMediaSrc;
                }
                closeAIPanel();
            });
            
            // 添加应用按钮事件
            applyBtn.addEventListener('click', () => {
                const currentImage = document.getElementById('current-image');
                const previewImage = aiPanelContent.querySelector('.preview-image');
                
                // 检查是否正在处理裁剪，防止重复处理
                if (window.isProcessingCrop) {
                    console.log('正在处理裁剪，请稍候...');
                    return;
                }
                
                // 设置裁剪处理标志
                window.isProcessingCrop = true;
                
                if (currentImage && previewImage) {
                    try {
                        // 创建临时canvas
                        const tempCanvas = document.createElement('canvas');
                        const tempCtx = tempCanvas.getContext('2d');
                        
                        // 创建新图像对象，以确保图像已完全加载
                        const img = new Image();
                        img.onload = function() {
                            try {
                                // 使用标记变量跟踪是否使用了备选方案
                                let usedFallbackCrop = false;
                        
                        // 设置canvas尺寸为原始图像尺寸
                                tempCanvas.width = img.naturalWidth;
                                tempCanvas.height = img.naturalHeight;
                        
                        // 先绘制原始图像
                                tempCtx.drawImage(img, 0, 0);
                        
                        // 如果有旋转，创建新canvas处理旋转
                        let rotatedCanvas = tempCanvas;
                        if (currentRotation !== 0) {
                            rotatedCanvas = document.createElement('canvas');
                            const rotatedCtx = rotatedCanvas.getContext('2d');
                            
                            // 根据旋转角度设置画布尺寸
                            if (Math.abs(currentRotation) === 90 || Math.abs(currentRotation) === 270) {
                                rotatedCanvas.width = tempCanvas.height;
                                rotatedCanvas.height = tempCanvas.width;
                            } else {
                                rotatedCanvas.width = tempCanvas.width;
                                rotatedCanvas.height = tempCanvas.height;
                            }
                            
                            // 执行旋转
                            rotatedCtx.save();
                            rotatedCtx.translate(rotatedCanvas.width/2, rotatedCanvas.height/2);
                            rotatedCtx.rotate(currentRotation * Math.PI / 180);
                            rotatedCtx.drawImage(tempCanvas, 
                                -tempCanvas.width/2, 
                                -tempCanvas.height/2);
                            rotatedCtx.restore();
                        }
                        
                        // 如果开启了手动裁剪，执行裁剪
                        if (cropArea.style.display !== 'none') {
                                    // 获取裁剪区域尺寸，使用getBoundingClientRect
                            const cropRect = cropArea.getBoundingClientRect();
                                    const wrapperRect = previewWrapper.getBoundingClientRect();
                                    
                                    // 创建备选矩形信息，使用初始化时保存的dataset值
                                    const fallbackCropRect = {
                                        // 从dataset中获取初始化设置的值，注意这里是相对于预览图的位置
                                        left: parseFloat(cropArea.dataset.cropLeft || 0) + (wrapperRect.left || 0),
                                        top: parseFloat(cropArea.dataset.cropTop || 0) + (wrapperRect.top || 0),
                                        width: parseFloat(cropArea.dataset.cropWidth || 0),
                                        height: parseFloat(cropArea.dataset.cropHeight || 0)
                                    };
                                    
                                    // 检查getBoundingClientRect是否返回有效值
                                    const isCropRectValid = cropRect.width > 0 && cropRect.height > 0;
                                    const isWrapperRectValid = wrapperRect.width > 0 && wrapperRect.height > 0;
                                    
                                    // 创建裁剪区域和包装器的最终使用值，优先使用有效的getBoundingClientRect值，否则使用备选值
                                    const finalCropRect = isCropRectValid ? cropRect : fallbackCropRect;
                                    
                                    // 为finalWrapperRect获取可靠的尺寸值
                                    // 这里需要保证有一个有效的包装器尺寸，因为它关系到相对位置计算
                                    const finalWrapperRect = {
                                        left: isWrapperRectValid ? wrapperRect.left : 0,
                                        top: isWrapperRectValid ? wrapperRect.top : 0,
                                        width: isWrapperRectValid ? wrapperRect.width : parseFloat(previewImage.dataset.displayWidth || 277), // 设置一个默认值277
                                        height: isWrapperRectValid ? wrapperRect.height : parseFloat(previewImage.dataset.displayHeight || 208) // 设置一个默认值208
                                    };
                                    
                                    // 计算裁剪区域相对于预览包装器的位置
                                    const relativeCropRect = {
                                        left: finalCropRect.left - finalWrapperRect.left,
                                        top: finalCropRect.top - finalWrapperRect.top,
                                        width: finalCropRect.width,
                                        height: finalCropRect.height
                                    };
                                    
                                    // 使用保存的预览图像尺寸，确保imgRect始终有合理的值
                                    const defaultWidth = 277; // 默认的预览宽度
                                    const defaultHeight = 208; // 默认的预览高度
                                    
                                    const imgRect = {
                                        left: 0, // 相对位置
                                        top: 0,  // 相对位置
                                        width: parseFloat(previewImage.dataset.displayWidth || 0) || defaultWidth, // 确保有默认值
                                        height: parseFloat(previewImage.dataset.displayHeight || 0) || defaultHeight // 确保有默认值
                                    };
                                    
                                    // 输出调试信息，帮助诊断问题
                                    console.log('裁剪区域信息(使用getBoundingClientRect):', {
                                        cropRect: finalCropRect,
                                        relativeCropRect: {
                                            left: relativeCropRect.left,
                                            top: relativeCropRect.top,
                                            width: relativeCropRect.width,
                                            height: relativeCropRect.height
                                        },
                                        wrapperRect: finalWrapperRect,
                                        imgRect: {
                                            left: imgRect.left,
                                            top: imgRect.top,
                                            width: imgRect.width,
                                            height: imgRect.height
                                        },
                                        previewImage: {
                                            naturalWidth: previewImage.naturalWidth,
                                            naturalHeight: previewImage.naturalHeight
                                        },
                                        rotatedCanvas: {
                                            width: rotatedCanvas.width,
                                            height: rotatedCanvas.height
                                        },
                                        // 打印额外信息以便调试
                                        usingFallback: !isCropRectValid,
                                        datasetValues: {
                                            cropLeft: parseFloat(cropArea.dataset.cropLeft || 0),
                                            cropTop: parseFloat(cropArea.dataset.cropTop || 0),
                                            cropWidth: parseFloat(cropArea.dataset.cropWidth || 0),
                                            cropHeight: parseFloat(cropArea.dataset.cropHeight || 0)
                                        }
                                    });
                                    
                                    // 放宽验证条件，使用小阈值而非严格的0
                                    const MIN_SIZE = 5; // 5像素最小阈值
                                    let useSafeCropArea = false;
                                    
                                    // 使用finalCropRect进行验证
                                    if (finalCropRect.width < MIN_SIZE || finalCropRect.height < MIN_SIZE || 
                                        imgRect.width < MIN_SIZE || imgRect.height < MIN_SIZE) {
                                        console.error('裁剪区域或图像尺寸过小');
                                        useSafeCropArea = true;
                                    }
                                    
                                    if (useSafeCropArea) {
                                        // 使用一个安全的默认裁剪区域 - 图像中心位置的80%区域
                                        console.warn('使用安全的默认裁剪区域');
                                        const safeWidth = rotatedCanvas.width * 0.8;
                                        const safeHeight = rotatedCanvas.height * 0.8;
                                        const safeX = (rotatedCanvas.width - safeWidth) / 2;
                                        const safeY = (rotatedCanvas.height - safeHeight) / 2;
                                        
                                        // 创建最终的裁剪canvas
                                        const croppedCanvas = document.createElement('canvas');
                                        croppedCanvas.width = safeWidth;
                                        croppedCanvas.height = safeHeight;
                                        const croppedCtx = croppedCanvas.getContext('2d');
                                        
                                        // 执行安全裁剪
                                        croppedCtx.drawImage(rotatedCanvas,
                                            safeX, safeY, safeWidth, safeHeight,
                                            0, 0, safeWidth, safeHeight);
                                        
                                        // 更新图像
                                        const dataURL = croppedCanvas.toDataURL('image/jpeg', 0.95);
                                        currentImage.src = dataURL;
                                        
                                        // 更新媒体数据
                                        if (mediaData[currentMediaIndex]) {
                                            mediaData[currentMediaIndex].src = dataURL;
                                            // 更新原始源，以便下次编辑使用新的状态
                                            window.originalMediaSrc = dataURL;
                                        }
                                        
                                        // 标记使用了备选方案
                                        usedFallbackCrop = true;
                                        
                                        // 在关闭面板后再显示通知，以免打断操作流程
                                        setTimeout(() => {
                                            alert('裁剪区域设置不理想，已自动使用图像中心区域');
                                        }, 500);
                                    } else {
                            // 计算裁剪区域相对于图像的比例
                            const scaleX = rotatedCanvas.width / imgRect.width;
                            const scaleY = rotatedCanvas.height / imgRect.height;
                            
                                        // 计算裁剪区域在预览图像中的相对位置和尺寸（百分比）
                                        let relativeLeft, relativeTop, relativeWidth, relativeHeight;
                                        
                                        // 根据是否使用fallback值，采用不同的计算方式
                                        if (!isCropRectValid) {
                                            // 当使用备选值时，直接使用比例而不是相对位置
                                            // dataset中保存的值就是相对于预览图的位置，直接计算比例
                                            relativeLeft = Math.max(0, Math.min(1, parseFloat(cropArea.dataset.cropLeft || 0) / imgRect.width));
                                            relativeTop = Math.max(0, Math.min(1, parseFloat(cropArea.dataset.cropTop || 0) / imgRect.height));
                                            relativeWidth = Math.max(0.05, Math.min(1, parseFloat(cropArea.dataset.cropWidth || 0) / imgRect.width));
                                            relativeHeight = Math.max(0.05, Math.min(1, parseFloat(cropArea.dataset.cropHeight || 0) / imgRect.height));
                                        } else {
                                            // 使用getBoundingClientRect获取的值时，使用原计算方式
                                            relativeLeft = Math.max(0, Math.min(1, relativeCropRect.left / imgRect.width));
                                            relativeTop = Math.max(0, Math.min(1, relativeCropRect.top / imgRect.height));
                                            relativeWidth = Math.max(0.05, Math.min(1, relativeCropRect.width / imgRect.width));
                                            relativeHeight = Math.max(0.05, Math.min(1, relativeCropRect.height / imgRect.height));
                                        }
                                        
                                        // 确保裁剪区域不超出图像边界
                                        const adjustedRelativeWidth = Math.min(relativeWidth, 1 - relativeLeft);
                                        
                                        // 使用原始高度，除非会超出图像边界
                                        const adjustedRelativeHeight = relativeTop + relativeHeight > 1 ? 
                                            1 - relativeTop : relativeHeight;
                                        
                                        // 基于相对位置和尺寸计算实际裁剪区域（像素坐标）
                                        // 修改：考虑预览图像可能有内边距或者缩放导致的偏移
                                        // 获取预览图像的实际显示尺寸和原始尺寸比例
                                        const previewImgRect = previewImage.getBoundingClientRect();
                                        const displayToNaturalRatioW = previewImage.naturalWidth / previewImgRect.width;
                                        const displayToNaturalRatioH = previewImage.naturalHeight / previewImgRect.height;
                                        
                                        // 计算预览图相对于包装器的位置偏移量（处理图像居中等情况）
                                        const imgOffsetLeft = (imgRect.width - previewImgRect.width) / 2;
                                        const imgOffsetTop = (imgRect.height - previewImgRect.height) / 2;
                                        
                                        // 调整相对位置，考虑实际预览图的显示位置
                                        const adjustedRelativeLeft = Math.max(0, (relativeCropRect.left - imgOffsetLeft) / previewImgRect.width);
                                        const adjustedRelativeTop = Math.max(0, (relativeCropRect.top - imgOffsetTop) / previewImgRect.height);
                                        
                                        // 使用调整后的相对位置和尺寸计算实际裁剪区域（像素坐标）
                                        const cropX = Math.floor((!isCropRectValid ? relativeLeft : adjustedRelativeLeft) * rotatedCanvas.width);
                                        const cropY = Math.floor((!isCropRectValid ? relativeTop : adjustedRelativeTop) * rotatedCanvas.height);
                                        const cropWidth = Math.ceil(adjustedRelativeWidth * rotatedCanvas.width);
                                        const cropHeight = Math.ceil(adjustedRelativeHeight * rotatedCanvas.height);
                                        
                                        // 确保裁剪尺寸合理
                                        const finalCropWidth = Math.min(cropWidth, rotatedCanvas.width - cropX);
                                        const finalCropHeight = Math.min(cropHeight, rotatedCanvas.height - cropY);
                                        
                                        console.log('计算后的裁剪参数:', {
                                            cropX, cropY, cropWidth, cropHeight,
                                            finalCropWidth, finalCropHeight, // 添加最终裁剪尺寸到日志
                                            scaleX, scaleY,
                                            relativeLeft, relativeTop, relativeWidth, relativeHeight,
                                            adjustedRelativeWidth, adjustedRelativeHeight,
                                            cropRect: finalCropRect, imgRect, // 使用finalCropRect防止显示空对象
                                            usingDirectCalc: !isCropRectValid // 指明是否使用直接计算（dataset值）
                                        });
                                        
                                        // 检查计算后的裁剪尺寸
                                        if (finalCropWidth < 1 || finalCropHeight < 1) {
                                            // 如果计算出的尺寸太小，也使用安全的默认裁剪区域
                                            console.warn('计算后的裁剪尺寸过小，使用安全的默认裁剪区域');
                                            
                                            // 使用一个安全的默认裁剪区域 - 图像中心位置的80%区域
                                            const safeWidth = rotatedCanvas.width * 0.8;
                                            const safeHeight = rotatedCanvas.height * 0.8;
                                            const safeX = (rotatedCanvas.width - safeWidth) / 2;
                                            const safeY = (rotatedCanvas.height - safeHeight) / 2;
                            
                            // 创建最终的裁剪canvas
                            const croppedCanvas = document.createElement('canvas');
                                            croppedCanvas.width = safeWidth;
                                            croppedCanvas.height = safeHeight;
                            const croppedCtx = croppedCanvas.getContext('2d');
                            
                                            // 执行安全裁剪
                                            croppedCtx.drawImage(rotatedCanvas,
                                                safeX, safeY, safeWidth, safeHeight,
                                                0, 0, safeWidth, safeHeight);
                                            
                                            // 更新图像
                                            const dataURL = croppedCanvas.toDataURL('image/jpeg', 0.95);
                                            currentImage.src = dataURL;
                                            
                                            // 更新媒体数据
                                            if (mediaData[currentMediaIndex]) {
                                                mediaData[currentMediaIndex].src = dataURL;
                                                // 更新原始源，以便下次编辑使用新的状态
                                                window.originalMediaSrc = dataURL;
                                            }
                                            
                                            // 标记使用了备选方案
                                            usedFallbackCrop = true;
                                            
                                            // 在关闭面板后再显示通知，以免打断操作流程
                                            setTimeout(() => {
                                                alert('裁剪区域设置不理想，已自动使用图像中心区域');
                                            }, 500);
                                        } else {
                                            // 正常路径 - 使用计算出的裁剪参数
                                            // 创建最终的裁剪canvas
                                            const croppedCanvas = document.createElement('canvas');
                                            croppedCanvas.width = finalCropWidth;
                                            croppedCanvas.height = finalCropHeight;
                                            const croppedCtx = croppedCanvas.getContext('2d');
                                            
                                            try {
                            // 执行裁剪
                            croppedCtx.drawImage(rotatedCanvas,
                                                    cropX, cropY, finalCropWidth, finalCropHeight,
                                                    0, 0, finalCropWidth, finalCropHeight);
                            
                            // 更新图像
                            const dataURL = croppedCanvas.toDataURL('image/jpeg', 0.95);
                            currentImage.src = dataURL;
                            
                            // 更新媒体数据
                            if (mediaData[currentMediaIndex]) {
                                mediaData[currentMediaIndex].src = dataURL;
                                                    // 更新原始源，以便下次编辑使用新的状态
                                                    window.originalMediaSrc = dataURL;
                                                }
                                            } catch (cropError) {
                                                console.error('裁剪执行失败:', cropError);
                                                
                                                // 失败时也使用安全的裁剪区域
                                                console.warn('裁剪执行失败，使用安全的默认裁剪区域');
                                                
                                                // 使用安全的默认裁剪区域
                                                const safeWidth = rotatedCanvas.width * 0.8;
                                                const safeHeight = rotatedCanvas.height * 0.8;
                                                const safeX = (rotatedCanvas.width - safeWidth) / 2;
                                                const safeY = (rotatedCanvas.height - safeHeight) / 2;
                                                
                                                // 创建最终的裁剪canvas
                                                const croppedCanvas = document.createElement('canvas');
                                                croppedCanvas.width = safeWidth;
                                                croppedCanvas.height = safeHeight;
                                                const croppedCtx = croppedCanvas.getContext('2d');
                                                
                                                // 执行安全裁剪
                                                croppedCtx.drawImage(rotatedCanvas,
                                                    safeX, safeY, safeWidth, safeHeight,
                                                    0, 0, safeWidth, safeHeight);
                                                
                                                // 更新图像
                                                const dataURL = croppedCanvas.toDataURL('image/jpeg', 0.95);
                                                currentImage.src = dataURL;
                                                
                                                // 更新媒体数据
                                                if (mediaData[currentMediaIndex]) {
                                                    mediaData[currentMediaIndex].src = dataURL;
                                                    // 更新原始源，以便下次编辑使用新的状态
                                                    window.originalMediaSrc = dataURL;
                                                }
                                                
                                                // 标记使用了备选方案
                                                usedFallbackCrop = true;
                                                
                                                // 在关闭面板后再显示通知，以免打断操作流程
                                                setTimeout(() => {
                                                    alert('裁剪执行失败，已自动使用图像中心区域');
                                                }, 500);
                                            }
                                        }
                            }
                        } else {
                            // 如果没有裁剪，直接使用旋转后的图像
                            const dataURL = rotatedCanvas.toDataURL('image/jpeg', 0.95);
                            currentImage.src = dataURL;
                            
                            // 更新媒体数据
                            if (mediaData[currentMediaIndex]) {
                                mediaData[currentMediaIndex].src = dataURL;
                                        // 更新原始源，以便下次编辑使用新的状态
                                        window.originalMediaSrc = dataURL;
                            }
                        }
                        
                                // 关闭AI面板 - 无论是否使用备选方案都关闭面板
                        closeAIPanel();
                        
                                // 处理完成后重置标志
                                window.isProcessingCrop = false;
                                
                                // 如果使用了备选方案则不需要显示成功消息
                                if (!usedFallbackCrop) {
                                    // 可以添加一个成功提示
                                    console.log('裁剪成功完成');
                                }
                    } catch (error) {
                                console.error('裁剪过程中发生错误:', error);
                                window.isProcessingCrop = false;
                                
                                // 显示错误提示并关闭面板
                                alert('裁剪过程出错，请重试');
                                closeAIPanel();
                            }
                        };
                        
                        img.onerror = function(error) {
                            console.error('加载裁剪图像失败:', error);
                            window.isProcessingCrop = false;
                            alert('加载图像失败，请重试');
                            closeAIPanel();
                        };
                        
                        // 确保使用当前最新的源
                        img.src = window.originalMediaSrc || mediaData[currentMediaIndex].src;
                    } catch (error) {
                        console.error('初始化裁剪过程失败:', error);
                        window.isProcessingCrop = false;
                        alert('初始化裁剪失败，请重试');
                        closeAIPanel();
                    }
                } else {
                    console.error('无法找到当前图像或预览图像元素');
                    window.isProcessingCrop = false;
                    alert('找不到图像元素，请重试');
                    closeAIPanel();
                }
            });
        }, 100);
    }

    // 添加自动裁剪功能并应用到预览图像
    function applyAutoCropToPreview(tempCanvas, previewImage) {
        try {
            // 检查 ImageProcessor 是否可用
            if (typeof ImageProcessor === 'undefined') {
                throw new Error('ImageProcessor 未加载，请确保已引入 image-processor.js');
            }
            
            // 创建源图像Mat
            let src = cv.imread(tempCanvas);
            if (src.empty()) {
                throw new Error('无法读取图像');
            }

            // 初始化ImageProcessor
            const imageProcessor = new ImageProcessor();
            imageProcessor.start();

            // 处理图像
            const result = imageProcessor.processFrame(src);
            if (!result || !result.transformed || result.transformed.empty()) {
                throw new Error('图像处理失败');
            }

            // 将透视变换后的图像显示到临时canvas
            cv.imshow(tempCanvas, result.transformed);

            // 将canvas内容转换为图片src并应用到预览图像
            const dataURL = tempCanvas.toDataURL('image/jpeg', 0.95);
            if (previewImage) {
                previewImage.src = dataURL;
            }

            // 清理内存
            src.delete();
            if (result.original) result.original.delete();
            if (result.transformed) result.transformed.delete();
            imageProcessor.stop();

            return true;
        } catch (error) {
            console.error('自动裁剪失败:', error);
            return false;
        }
    }

    // 原始的裁剪方法留作备用
    function applyAutoCrop(tempCanvas, callback) {
        try {
            // 检查 ImageProcessor 是否可用
            if (typeof ImageProcessor === 'undefined') {
                throw new Error('ImageProcessor 未加载，请确保已引入 image-processor.js');
            }
            
            // 创建源图像Mat
            let src = cv.imread(tempCanvas);
            if (src.empty()) {
                throw new Error('无法读取图像');
            }

            // 初始化ImageProcessor
            const imageProcessor = new ImageProcessor();
            imageProcessor.start();

            // 处理图像
            const result = imageProcessor.processFrame(src);
            if (!result || !result.transformed || result.transformed.empty()) {
                throw new Error('图像处理失败');
            }

            // 将透视变换后的图像显示到临时canvas
            cv.imshow(tempCanvas, result.transformed);

            // 将canvas内容转换为图片src
            const dataURL = tempCanvas.toDataURL('image/jpeg', 0.95);
            
            // 如果传入了回调函数，使用回调处理结果
            if (typeof callback === 'function') {
                callback(dataURL);
            } else {
                // 兼容旧版调用方式
            const currentImage = document.getElementById('current-image');
            if (!currentImage) {
                throw new Error('找不到当前图片元素');
            }
            currentImage.src = dataURL;
            }

            // 清理内存
            src.delete();
            if (result.original) result.original.delete();
            if (result.transformed) result.transformed.delete();
            imageProcessor.stop();

            return true;
        } catch (error) {
            console.error('自动裁剪失败:', error);
            if (typeof callback === 'function') {
                callback(null); // 失败时传递null
            }
            return false;
        }
    }
}

// 监听来自设置窗口的消息
window.addEventListener('message', (event) => {
    if (event.data) {
        if (event.data.type === 'update_resolution') {
            console.log('收到分辨率更新消息:', event.data.resolution);
            // 在这里更新主界面显示的分辨率
            const resolutionDisplay = document.getElementById('resolution-display');
            if (resolutionDisplay) {
                resolutionDisplay.textContent = `当前分辨率: ${event.data.resolution}`;
            }
        }
        // 其他消息处理...
    }
});

// 初始化应用
init(); 

// 在gallery.js顶部，添加控制台查看器代码
let consoleViewer = null;
let consoleViewerReady = false;

// 创建控制台查看器窗口
function openConsoleViewer() {
    try {
        // 检查NW.js环境
        if (typeof nw === 'undefined') {
            console.error('无法访问nw对象，可能不在NW.js环境中');
            return;
        }
        
        // 如果已经打开，就聚焦
        if (consoleViewer && !consoleViewer.closed) {
            consoleViewer.focus();
            return;
        }
        
        // 获取应用路径
        const appPath = nw.App.startPath;
        const viewerPath = 'file://' + appPath + '/console/console-viewer.html';
        
        // 打开新窗口
        consoleViewer = window.open(viewerPath, 'console-viewer', 'width=800,height=600');
        
        // 设置窗口关闭时的处理
        if (consoleViewer) {
            consoleViewer.onload = function() {
                console.log('控制台查看器已加载');
            };
            
            consoleViewer.onbeforeunload = function() {
                consoleViewer = null;
                consoleViewerReady = false;
                console.log('控制台查看器已关闭');
            };
        }
    } catch (error) {
        alert('打开控制台查看器失败: ' + error.message);
    }
}

// 监听消息事件
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'console-viewer-ready') {
        consoleViewerReady = true;
        console.log('控制台查看器准备就绪');
        
        // 发送一些测试日志
        console.log('控制台查看器连接成功');
        console.info('这是一条信息');
        console.warn('这是一条警告');
        console.error('这是一条错误');
    }
});

// 重写控制台方法
(function() {
    // 保存原始方法
    const originalConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info
    };
    
    // 重写console.log
    console.log = function() {
        // 调用原始方法
        originalConsole.log.apply(console, arguments);
        
        // 发送到查看器
        sendToConsoleViewer('log', arguments);
    };
    
    // 重写console.error
    console.error = function() {
        // 调用原始方法
        originalConsole.error.apply(console, arguments);
        
        // 发送到查看器
        sendToConsoleViewer('error', arguments);
    };
    
    // 重写console.warn
    console.warn = function() {
        // 调用原始方法
        originalConsole.warn.apply(console, arguments);
        
        // 发送到查看器
        sendToConsoleViewer('warn', arguments);
    };
    
    // 重写console.info
    console.info = function() {
        // 调用原始方法
        originalConsole.info.apply(console, arguments);
        
        // 发送到查看器
        sendToConsoleViewer('info', arguments);
    };
    
    // 发送日志到查看器
    function sendToConsoleViewer(logType, args) {
        if (consoleViewer && !consoleViewer.closed && consoleViewerReady) {
            try {
                // 获取当前时间
                const timestamp = new Date().toISOString().substr(11, 8);
                
                // 预处理参数，处理不能被复制到另一个窗口的对象
                const processedArgs = Array.from(args).map(arg => {
                    // 简单类型直接传递
                    if (arg === null || arg === undefined || 
                        typeof arg === 'string' || 
                        typeof arg === 'number' || 
                        typeof arg === 'boolean') {
                        return arg;
                    }
                    
                    // 处理特殊类型
                    if (typeof arg === 'function') {
                        return `function ${arg.name || ''}() {...}`;
                    }
                    
                    if (typeof arg === 'symbol') {
                        return arg.toString();
                    }
                    
                    // 处理错误对象
                    if (arg instanceof Error) {
                        return {
                            _special: 'error',
                            name: arg.name,
                            message: arg.message,
                            stack: arg.stack
                        };
                    }
                    
                    // 处理DOM节点
                    if (arg instanceof HTMLElement) {
                        return {
                            _special: 'html',
                            tagName: arg.tagName.toLowerCase(),
                            id: arg.id || '',
                            className: arg.className || ''
                        };
                    }
                    
                    // 处理日期
                    if (arg instanceof Date) {
                        return {
                            _special: 'date',
                            isoString: arg.toISOString()
                        };
                    }
                    
                    // 处理正则表达式
                    if (arg instanceof RegExp) {
                        return {
                            _special: 'regexp',
                            pattern: arg.toString()
                        };
                    }
                    
                    // 处理数组
                    if (Array.isArray(arg)) {
                        // 对于大数组，限制传递的元素数量
                        if (arg.length > 1000) {
                            return {
                                _special: 'array',
                                length: arg.length,
                                preview: arg.slice(0, 100)
                            };
                        }
                    }
                    
                    // 处理对象 - 尝试安全复制
                    if (typeof arg === 'object') {
                        try {
                            // 创建简单的复制并跟踪循环引用
                            return simplifyObject(arg);
                        } catch (e) {
                            return `[无法序列化的对象: ${e.message}]`;
                        }
                    }
                    
                    // 其他情况，尝试字符串化
                    return String(arg);
                });
                
                // 发送消息
                consoleViewer.postMessage({
                    consoleLog: {
                        logType,
                        args: processedArgs,
                        timestamp
                    }
                }, '*');
            } catch (error) {
                // 静默处理错误，避免递归调用
                // 但是在调试模式下可以启用以下代码
                // originalConsole.error('发送日志到查看器失败:', error);
            }
        }
    }
    
    // 辅助函数：简化对象以便安全传输
    function simplifyObject(obj, maxDepth = 3, seen = new WeakMap()) {
        // 基本类型直接返回
        if (obj === null || obj === undefined || typeof obj !== 'object') {
            return obj;
        }
        
        // 检查是否已经处理过该对象（循环引用检测）
        if (seen.has(obj)) {
            return '[循环引用]';
        }
        
        // 达到最大深度
        if (maxDepth <= 0) {
            if (Array.isArray(obj)) {
                return `[Array(${obj.length})]`;
            }
            return '[Object]';
        }
        
        // 记录当前对象，防止循环引用
        seen.set(obj, true);
        
        // 处理数组
        if (Array.isArray(obj)) {
            return obj.map(item => simplifyObject(item, maxDepth - 1, seen));
        }
        
        // 处理普通对象
        const result = {};
        // 只处理自身的可枚举属性
        Object.keys(obj).forEach(key => {
            try {
                // 忽略函数和过大的对象
                if (typeof obj[key] === 'function') {
                    result[key] = `[Function: ${obj[key].name || 'anonymous'}]`;
                } else if (key === '_maxListeners' || key === '_events') {
                    // 跳过Node.js特定的事件发射器属性
                    result[key] = '[Event Emitter Data]';
                } else {
                    // 递归处理子属性
                    result[key] = simplifyObject(obj[key], maxDepth - 1, seen);
                }
            } catch (e) {
                result[key] = `[Error: ${e.message}]`;
            }
        });
        
        return result;
    }
})();

// 添加控制台查看器按钮
function addConsoleViewerButton() {
    try {
        // 创建按钮
        const viewerBtn = document.createElement('button');
        viewerBtn.textContent = '控制台';
        viewerBtn.style.position = 'fixed';
        viewerBtn.style.bottom = '10px';
        viewerBtn.style.left = '10px';
        viewerBtn.style.zIndex = '9999';
        viewerBtn.style.padding = '5px 10px';
        viewerBtn.style.backgroundColor = 'rgba(0,0,0,0.7)';
        viewerBtn.style.color = 'white';
        viewerBtn.style.border = '1px solid #666';
        viewerBtn.style.borderRadius = '4px';
        viewerBtn.style.fontSize = '12px';
        viewerBtn.style.cursor = 'pointer';
        
        // 添加点击事件
        viewerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openConsoleViewer();
        });
        
        // 添加到文档
        document.body.appendChild(viewerBtn);
        console.log('已添加控制台查看器按钮');
    } catch (error) {
        console.error('添加控制台查看器按钮失败:', error);
    }
}

// 在初始化函数中调用添加按钮
document.addEventListener('DOMContentLoaded', function() {
    // 等待DOM加载完成后添加按钮
    setTimeout(addConsoleViewerButton, 1000);
    
    // 添加键盘快捷键
    document.addEventListener('keydown', function(e) {
        // 使用Alt+C打开控制台查看器
        if (e.altKey && e.code === 'KeyC') {
            e.preventDefault();
            openConsoleViewer();
        }
    });
}); 

function calculateCropParams() {
    // 获取裁剪区域和预览图像元素
    const cropArea = document.querySelector('.crop-area');
    const previewImage = document.querySelector('.preview-wrapper .preview-image');
    
    if (!cropArea || !previewImage) {
        console.error('找不到裁剪区域或预览图像元素');
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    
    // 获取裁剪区域和预览图像的位置和尺寸
    const cropRect = cropArea.getBoundingClientRect();
    const imgRect = previewImage.getBoundingClientRect();
    
    console.log('裁剪区域:', { 
        left: cropRect.left, 
        top: cropRect.top, 
        width: cropRect.width, 
        height: cropRect.height 
    });
    
    console.log('预览图像:', { 
        left: imgRect.left, 
        top: imgRect.top, 
        width: imgRect.width, 
        height: imgRect.height 
    });
    
    // 计算裁剪区域相对于图像的位置和大小（相对比例）
    const relativeLeft = (cropRect.left - imgRect.left) / imgRect.width;
    const relativeTop = (cropRect.top - imgRect.top) / imgRect.height;
    const relativeWidth = cropRect.width / imgRect.width;
    const relativeHeight = cropRect.height / imgRect.height;
    
    // 确保所有相对值都在0-1范围内，同时确保最小尺寸为10%
    const safeRelativeLeft = Math.min(Math.max(relativeLeft, 0), 0.9);
    const safeRelativeTop = Math.min(Math.max(relativeTop, 0), 0.9);
    const safeRelativeWidth = Math.min(Math.max(relativeWidth, 0.1), 1 - safeRelativeLeft);
    const safeRelativeHeight = Math.min(Math.max(relativeHeight, 0.1), 1 - safeRelativeTop);
    
    // 获取图像的自然尺寸
    const naturalWidth = previewImage.naturalWidth;
    const naturalHeight = previewImage.naturalHeight;
    
    // 使用相对比例和自然尺寸计算实际裁剪参数，确保像素对齐
    const cropX = Math.round(safeRelativeLeft * naturalWidth);
    const cropY = Math.round(safeRelativeTop * naturalHeight);
    const cropWidth = Math.round(safeRelativeWidth * naturalWidth);
    const cropHeight = Math.round(safeRelativeHeight * naturalHeight);
    
    // 打印最终计算的裁剪参数用于调试
    console.log('最终裁剪参数:', {
        relativeLeft: safeRelativeLeft,
        relativeTop: safeRelativeTop,
        relativeWidth: safeRelativeWidth,
        relativeHeight: safeRelativeHeight,
        cropX: cropX,
        cropY: cropY,
        cropWidth: cropWidth,
        cropHeight: cropHeight,
        naturalWidth: naturalWidth,
        naturalHeight: naturalHeight
    });
    
    return {
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight
    };
} 

// 更新裁剪区域的位置和大小
function updateCropArea(left, top, width, height) {
    // 使用全局或父作用域中的cropArea和previewImage变量
    const cropAreaElement = document.querySelector('.crop-area');
    const previewImageElement = document.querySelector('.preview-wrapper .preview-image');
    
    if (!cropAreaElement || !previewImageElement) {
        console.error('Crop area or preview image not found');
        return;
    }
    
    const maxWidth = parseInt(previewImageElement.dataset.displayWidth);
    const maxHeight = parseInt(previewImageElement.dataset.displayHeight);
    
    // 确保裁剪区域不超出图像边界
    left = Math.max(0, Math.min(left, maxWidth - width));
    top = Math.max(0, Math.min(top, maxHeight - height));
    
    // 确保宽高不小于最小值且不超出图像
    width = Math.max(50, Math.min(width, maxWidth - left));
    height = Math.max(50, Math.min(height, maxHeight - top));
    
    // 更新样式
    cropAreaElement.style.left = left + 'px';
    cropAreaElement.style.top = top + 'px';
    cropAreaElement.style.width = width + 'px';
    cropAreaElement.style.height = height + 'px';
    
    // 更新数据集
    cropAreaElement.dataset.cropLeft = left;
    cropAreaElement.dataset.cropTop = top;
    cropAreaElement.dataset.cropWidth = width;
    cropAreaElement.dataset.cropHeight = height;
} 

// 添加加载提示函数
function showLoading() {
    let loadingElem = document.querySelector('.loading-indicator');
    if (!loadingElem) {
        loadingElem = document.createElement('div');
        loadingElem.className = 'loading-indicator';
        loadingElem.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">处理中...</div>
        `;
        
        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .loading-indicator {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 20px;
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                align-items: center;
                z-index: 9999;
            }
            .loading-spinner {
                width: 30px;
                height: 30px;
                border: 3px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top-color: #fff;
                animation: spin 1s ease-in-out infinite;
                margin-bottom: 10px;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(loadingElem);
    } else {
        loadingElem.style.display = 'flex';
    }
}

function hideLoading() {
    const loadingElem = document.querySelector('.loading-indicator');
    if (loadingElem) {
        loadingElem.style.display = 'none';
    }
}

// 保存dataURL到指定路径，覆盖原始文件
async function saveDataURLToFile(dataURL, filePath) {
    try {
        console.log('正在保存图像到文件:', filePath);
        
        // 检查NW.js环境
        if (typeof nw === 'undefined') {
            console.error('不在NW.js环境中');
            return false;
        }
        
        // 获取fs模块
        const fs = nw.require('fs');
        
        // 从dataURL提取base64数据
        const base64Data = dataURL.replace(/^data:image\/\w+;base64,/, '');
        
        // 将base64转换为Buffer并写入文件
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);
        
        console.log('文件保存成功');
        return true;
    } catch (error) {
        console.error('保存文件失败:', error);
        return false;
    }
}

// 添加通知显示功能
function showNotification(message, isError = false) {
    try {
        let notificationElem = document.getElementById('gallery-notification');
        if (!notificationElem) {
            notificationElem = document.createElement('div');
            notificationElem.id = 'gallery-notification';
            document.body.appendChild(notificationElem);
            
            // 添加样式
            const style = document.createElement('style');
            style.textContent = `
                #gallery-notification {
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background-color: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 10px 20px;
                    border-radius: 4px;
                    z-index: 9999;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                #gallery-notification.error {
                    background-color: rgba(200, 0, 0, 0.9);
                }
                #gallery-notification.show {
                    opacity: 1;
                }
            `;
            document.head.appendChild(style);
        }
        
        // 设置消息和类型
        notificationElem.textContent = message;
        if (isError) {
            notificationElem.classList.add('error');
        } else {
            notificationElem.classList.remove('error');
        }
        
        // 显示通知
        notificationElem.classList.add('show');
        
        // 自动隐藏
        setTimeout(() => {
            notificationElem.classList.remove('show');
        }, 3000);
    } catch (error) {
        console.error('显示通知失败:', error);
    }
}

// 启用撤销按钮
function enableUndoButton() {
    const undoButton = document.getElementById('undo-btn');
    if (undoButton) {
        undoButton.removeAttribute('disabled');
    }
}

// 禁用撤销按钮
function disableUndoButton() {
    const undoButton = document.getElementById('undo-btn');
    if (undoButton) {
        undoButton.setAttribute('disabled', 'disabled');
    }
}

// 执行撤销操作
function performUndo() {
    // 获取当前图像元素
    const currentImage = document.getElementById('current-image');
    if (!currentImage || !window.originalMediaSrc) return;
    
    // 恢复到原始图像
    currentImage.src = window.originalMediaSrc;
    
    // 更新媒体数据
    if (mediaData[currentMediaIndex]) {
        const originalFilePath = mediaData[currentMediaIndex].src;
        
        // 尝试将原始图像保存回文件
        saveDataURLToFile(window.originalMediaSrc, originalFilePath)
            .then(saveSuccess => {
                if (saveSuccess) {
                    // 更新媒体数据
                    mediaData[currentMediaIndex].src = originalFilePath;
                    
                    // 更新媒体缩略图
                    mediaData[currentMediaIndex].thumbnail = window.originalMediaSrc;
                    
                    // 更新底部预览区域
                    updateThumbnails();
                    
                    // 显示成功通知
                    showNotification('已撤销到原始状态');
                } else {
                    // 保存失败，仅更新内存中的图像
                    mediaData[currentMediaIndex].src = window.originalMediaSrc;
                    mediaData[currentMediaIndex].thumbnail = window.originalMediaSrc;
                    updateThumbnails();
                    
                    // 显示失败通知
                    showNotification('无法保存到原文件，已撤销界面显示', true);
                }
                
                // 禁用撤销按钮，因为已经恢复到原始状态
                disableUndoButton();
                
                // 清除保存的原始图像
                window.originalMediaSrc = null;
            });
    }
}