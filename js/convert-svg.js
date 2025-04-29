// SVG转PNG转换脚本
const fs = require('fs');
const path = require('path');

// 创建Canvas元素
function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// 将SVG转换为PNG
function convertSvgToPng(svgPath, pngPath, width, height) {
  console.log(`开始转换 ${svgPath} 到 ${pngPath}`);
  
  // 读取SVG文件
  const svgData = fs.readFileSync(svgPath, 'utf8');
  
  // 创建图像对象
  const img = new Image();
  img.onload = function() {
    // 创建Canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // 绘制图像
    ctx.drawImage(img, 0, 0, width, height);
    
    // 获取数据URL
    const dataUrl = canvas.toDataURL('image/png');
    
    // 从data URL提取base64数据
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    
    // 保存为文件
    fs.writeFileSync(pngPath, Buffer.from(base64Data, 'base64'));
    
    console.log(`转换完成: ${pngPath}`);
  };
  
  // 设置SVG数据
  const svgBlob = new Blob([svgData], {type: 'image/svg+xml'});
  const svgUrl = URL.createObjectURL(svgBlob);
  img.src = svgUrl;
}

// 转换资源目录下的SVG文件
function init() {
  const assetsDir = path.join(__dirname, '..', 'assets');
  
  // 转换相机图标
  const svgPath = path.join(assetsDir, 'camera-icon.svg');
  const pngPath = path.join(assetsDir, 'camera-icon.png');
  
  if (fs.existsSync(svgPath)) {
    convertSvgToPng(svgPath, pngPath, 256, 256);
  } else {
    console.error(`找不到SVG文件: ${svgPath}`);
  }
}

// 运行转换
init(); 