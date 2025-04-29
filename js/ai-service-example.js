/**
 * AliModelService使用示例
 * 展示如何使用阿里云大模型服务API接口
 */

import AliModelService from './ai-service.js';

// 初始化服务实例
async function initService() {
    // 从环境变量或配置文件获取API密钥
    const apiKey = process.env.DASHSCOPE_API_KEY || 'your-api-key-here';
    
    // 创建服务实例
    const aliModel = new AliModelService({
        apiKey,
        debug: true  // 开启调试模式
    });
    
    return aliModel;
}

// 示例1: 文本处理
async function textProcessingExample(aliModel) {
    console.log('===== 文本处理示例 =====');
    
    const result = await aliModel.processText('人工智能技术的发展对人类社会有哪些影响？', {
        systemPrompt: '你是一位专业的AI研究员，请提供深入、全面、客观的回答。',
        stream: true,
        onProgress: (data) => {
            if (data.type === 'text') {
                process.stdout.write(data.content);  // 实时输出文本
            }
        }
    });
    
    console.log('\n\n完整响应:\n', result.text);
}

// 示例2: 双语翻译
async function translationExample(aliModel) {
    console.log('\n\n===== 双语翻译示例 =====');
    
    const textToTranslate = '人工智能是研究、开发用于模拟、延伸和扩展人的智能的理论、方法、技术及应用系统的一门新的技术科学。';
    console.log('原文:', textToTranslate);
    
    const result = await aliModel.translateText(textToTranslate, '英语', {
        stream: false  // 使用非流式响应
    });
    
    console.log('翻译结果:', result.text);
}

// 示例3: 图像分析和理解
async function imageAnalysisExample(aliModel) {
    console.log('\n\n===== 图像分析示例 =====');
    
    // 可以是本地文件路径或URL
    const imagePath = './sample-image.jpg';  // 请确保此文件存在
    console.log(`分析图像: ${imagePath}`);
    
    const result = await aliModel.processImage(imagePath, '这张图片里有什么内容？请详细描述。', {
        stream: true,
        onProgress: (data) => {
            if (data.type === 'text') {
                process.stdout.write(data.content);
            }
        }
    });
    
    console.log('\n');
}

// 示例4: 图像中提取文本(OCR)
async function ocrExample(aliModel) {
    console.log('\n\n===== OCR文字识别示例 =====');
    
    // 包含文字的图像
    const imagePath = './text-image.jpg';  // 请确保此文件存在
    console.log(`从图像提取文本: ${imagePath}`);
    
    const result = await aliModel.extractTextFromImage(imagePath);
    console.log('识别结果:', result.text);
}

// 示例5: 生成图像标签
async function imageTaggingExample(aliModel) {
    console.log('\n\n===== 图像标签生成示例 =====');
    
    const imagePath = './sample-image.jpg';  // 请确保此文件存在
    console.log(`为图像生成标签: ${imagePath}`);
    
    const result = await aliModel.generateImageTags(imagePath);
    console.log('生成的标签:', result.text);
}

// 示例6: 生成带音频的响应
async function audioGenerationExample(aliModel) {
    console.log('\n\n===== 音频生成示例 =====');
    
    const result = await aliModel.processText('请介绍下中国的传统文化', {
        generateAudio: true,
        voice: 'Cherry',
        stream: true,
        onProgress: (data) => {
            if (data.type === 'text') {
                process.stdout.write(data.content);
            }
        }
    });
    
    // 保存音频文件
    if (result.audioBase64) {
        const audioPath = './response-audio.wav';
        await aliModel.saveAudioToFile(result.audioBase64, audioPath);
        console.log(`\n\n音频已保存至: ${audioPath}`);
    }
}

// 运行所有示例
async function runExamples() {
    try {
        const aliModel = await initService();
        
        // 运行各种示例
        await textProcessingExample(aliModel);
        await translationExample(aliModel);
        await imageAnalysisExample(aliModel);
        await ocrExample(aliModel);
        await imageTaggingExample(aliModel);
        await audioGenerationExample(aliModel);
        
        console.log('\n\n所有示例已完成运行！');
    } catch (error) {
        console.error('运行示例时出错:', error);
    }
}

// 执行示例
runExamples(); 