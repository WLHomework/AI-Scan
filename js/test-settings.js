// 测试打开设置窗口的方法
console.log('NW.js测试脚本');

function testOpenWindow() {
    try {
        console.log('测试1: 使用相对路径');
        nw.Window.open('./settings.html', {
            width: 900,
            height: 650,
            frame: false,
            title: '测试1'
        });
    } catch (err) {
        console.error('测试1失败:', err);
    }
    
    try {
        console.log('测试2: 使用绝对路径');
        const path = require('path');
        const settingsPath = path.join(process.cwd(), 'settings.html');
        console.log('尝试打开:', settingsPath);
        
        nw.Window.open(settingsPath, {
            width: 900,
            height: 650,
            frame: false,
            title: '测试2'
        });
    } catch (err) {
        console.error('测试2失败:', err);
    }
    
    try {
        console.log('测试3: 使用file://协议');
        const path = require('path');
        const settingsPath = 'file://' + path.join(process.cwd(), 'settings.html');
        console.log('尝试打开:', settingsPath);
        
        nw.Window.open(settingsPath, {
            width: 900,
            height: 650,
            frame: false,
            title: '测试3'
        });
    } catch (err) {
        console.error('测试3失败:', err);
    }
    
    try {
        console.log('测试4: 使用完整URL');
        const path = require('path');
        const settingsPath = 'file:///' + path.resolve(process.cwd(), 'settings.html').replace(/\\/g, '/');
        console.log('尝试打开:', settingsPath);
        
        nw.Window.open(settingsPath, {
            width: 900,
            height: 650,
            frame: false,
            title: '测试4'
        });
    } catch (err) {
        console.error('测试4失败:', err);
    }
}

// 延迟执行以防止初始化问题
setTimeout(testOpenWindow, 2000); 