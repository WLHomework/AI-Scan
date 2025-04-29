/**
 * 阿里云大模型服务API接口
 * 用于实现文字识别、双语翻译、图片理解以及生成标签等功能
 * 支持文本、图片及混合输入
 */

// 导入依赖
import OpenAI from "openai";
import { createWriteStream } from 'fs';
import { Writer } from 'wav';

/**
 * 阿里云大模型服务类
 * 封装了与阿里云通义千问大模型的交互
 */
class AliModelService {
    /**
     * 构造函数
     * @param {Object} config 配置对象
     * @param {string} config.apiKey API密钥
     * @param {string} config.baseURL API基础URL，默认为阿里云兼容模式URL
     * @param {boolean} config.debug 是否开启调试模式
     */
    constructor(config = {}) {
        // 验证配置
        if (!config.apiKey) {
            throw new Error('API密钥不能为空');
        }

        // 初始化配置
        this.apiKey = config.apiKey;
        this.baseURL = config.baseURL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
        this.debug = config.debug || false;
        
        // 初始化OpenAI客户端
        this.client = new OpenAI({
            apiKey: this.apiKey,
            baseURL: this.baseURL
        });
        
        // 默认模型
        this.model = "qwen-omni-turbo";
        
        // 调试信息
        if (this.debug) {
            console.log('阿里云大模型服务已初始化');
        }
    }
    
    /**
     * 文本理解和生成
     * 用于处理纯文本输入，返回模型生成的文本内容
     * 
     * @param {string} text 用户输入的文本
     * @param {Object} options 可选配置
     * @param {string} options.systemPrompt 系统提示词
     * @param {boolean} options.stream 是否使用流式输出
     * @param {boolean} options.generateAudio 是否生成音频
     * @param {string} options.voice 音频声音类型，默认为"Cherry"
     * @param {Function} options.onProgress 处理流式输出的回调函数
     * @returns {Promise<Object>} 返回处理结果对象
     */
    async processText(text, options = {}) {
        try {
            // 设置默认值
            const systemPrompt = options.systemPrompt || "You are a helpful assistant.";
            const stream = options.stream !== undefined ? options.stream : true;
            const generateAudio = options.generateAudio || false;
            const voice = options.voice || "Cherry";
            
            // 构建消息
            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ];
            
            // 构建请求参数
            const requestParams = {
                model: this.model,
                messages,
                stream
            };
            
            // 如果需要生成音频
            if (generateAudio) {
                requestParams.modalities = ["text", "audio"];
                requestParams.audio = { voice, format: "wav" };
            }
            
            // 如果使用流式输出且提供了回调
            if (stream && options.onProgress) {
                requestParams.stream_options = {
                    include_usage: true
                };
                
                // 调用API并处理流式输出
                const completion = await this.client.chat.completions.create(requestParams);
                let fullResponse = '';
                let audioData = '';
                
                for await (const chunk of completion) {
                    if (Array.isArray(chunk.choices) && chunk.choices.length > 0) {
                        const delta = chunk.choices[0].delta;
                        
                        // 处理文本
                        if (delta.content) {
                            fullResponse += delta.content;
                            options.onProgress({
                                type: 'text',
                                content: delta.content,
                                fullContent: fullResponse
                            });
                        }
                        
                        // 处理音频
                        if (generateAudio && delta.audio && delta.audio.data) {
                            audioData += delta.audio.data;
                            options.onProgress({
                                type: 'audio',
                                content: delta.audio.data,
                                fullContent: audioData
                            });
                        }
                    } else if (chunk.usage) {
                        options.onProgress({
                            type: 'usage',
                            content: chunk.usage
                        });
                    }
                }
                
                return {
                    text: fullResponse,
                    audioBase64: generateAudio ? audioData : null
                };
            } else {
                // 非流式输出
                const response = await this.client.chat.completions.create(requestParams);
                
                if (!stream) {
                    return {
                        text: response.choices[0].message.content,
                        audioBase64: generateAudio && response.choices[0].message.audio ? 
                                     response.choices[0].message.audio.data : null
                    };
                } else {
                    // 流式但没有回调，收集完整响应
                    let fullResponse = '';
                    let audioData = '';
                    
                    for await (const chunk of response) {
                        if (Array.isArray(chunk.choices) && chunk.choices.length > 0) {
                            if (chunk.choices[0].delta.content) {
                                fullResponse += chunk.choices[0].delta.content;
                            }
                            if (generateAudio && chunk.choices[0].delta.audio && chunk.choices[0].delta.audio.data) {
                                audioData += chunk.choices[0].delta.audio.data;
                            }
                        }
                    }
                    
                    return {
                        text: fullResponse,
                        audioBase64: generateAudio ? audioData : null
                    };
                }
            }
        } catch (error) {
            this._handleError(error, '处理文本时出错');
            throw error;
        }
    }
    
    /**
     * 图像理解和分析
     * 用于处理图像输入，返回模型对图像的理解结果
     * 
     * @param {string|Object} image 图像数据，可以是URL字符串或Base64编码对象 {data, contentType}
     * @param {string} prompt 图像相关的提示词
     * @param {Object} options 可选配置，同processText
     * @returns {Promise<Object>} 返回处理结果对象
     */
    async processImage(image, prompt, options = {}) {
        try {
            // 设置默认值
            const systemPrompt = options.systemPrompt || "You are a helpful assistant.";
            const stream = options.stream !== undefined ? options.stream : true;
            const generateAudio = options.generateAudio || false;
            const voice = options.voice || "Cherry";
            
            // 准备图像数据
            let imageContent;
            if (typeof image === 'string') {
                // 如果是URL
                if (image.startsWith('http')) {
                    imageContent = {
                        type: "image_url",
                        image_url: { url: image }
                    };
                } else {
                    // 假设是本地文件路径，读取并编码
                    const base64Image = await this._encodeImage(image);
                    imageContent = {
                        type: "image_url",
                        image_url: { url: `data:image/jpeg;base64,${base64Image}` }
                    };
                }
            } else if (image && image.data) {
                // 如果是已经编码好的数据
                const contentType = image.contentType || 'image/jpeg';
                imageContent = {
                    type: "image_url",
                    image_url: { url: `data:${contentType};base64,${image.data}` }
                };
            } else {
                throw new Error('无效的图像数据');
            }
            
            // 构建消息
            const messages = [
                {
                    role: "system",
                    content: [{ type: "text", text: systemPrompt }]
                },
                {
                    role: "user",
                    content: [
                        imageContent,
                        { type: "text", text: prompt }
                    ]
                }
            ];
            
            // 构建请求参数
            const requestParams = {
                model: this.model,
                messages,
                stream
            };
            
            // 如果需要生成音频
            if (generateAudio) {
                requestParams.modalities = ["text", "audio"];
                requestParams.audio = { voice, format: "wav" };
            }
            
            // 处理方式类似processText，但针对图像处理结果
            if (stream && options.onProgress) {
                requestParams.stream_options = {
                    include_usage: true
                };
                
                const completion = await this.client.chat.completions.create(requestParams);
                let fullResponse = '';
                let audioData = '';
                
                for await (const chunk of completion) {
                    if (Array.isArray(chunk.choices) && chunk.choices.length > 0) {
                        const delta = chunk.choices[0].delta;
                        
                        if (delta.content) {
                            fullResponse += delta.content;
                            options.onProgress({
                                type: 'text',
                                content: delta.content,
                                fullContent: fullResponse
                            });
                        }
                        
                        if (generateAudio && delta.audio && delta.audio.data) {
                            audioData += delta.audio.data;
                            options.onProgress({
                                type: 'audio',
                                content: delta.audio.data,
                                fullContent: audioData
                            });
                        }
                    } else if (chunk.usage) {
                        options.onProgress({
                            type: 'usage',
                            content: chunk.usage
                        });
                    }
                }
                
                return {
                    text: fullResponse,
                    audioBase64: generateAudio ? audioData : null
                };
            } else {
                // 非流式输出或没有回调的流式输出
                const response = await this.client.chat.completions.create(requestParams);
                
                if (!stream) {
                    return {
                        text: response.choices[0].message.content,
                        audioBase64: generateAudio && response.choices[0].message.audio ? 
                                     response.choices[0].message.audio.data : null
                    };
                } else {
                    let fullResponse = '';
                    let audioData = '';
                    
                    for await (const chunk of response) {
                        if (Array.isArray(chunk.choices) && chunk.choices.length > 0) {
                            if (chunk.choices[0].delta.content) {
                                fullResponse += chunk.choices[0].delta.content;
                            }
                            if (generateAudio && chunk.choices[0].delta.audio && chunk.choices[0].delta.audio.data) {
                                audioData += chunk.choices[0].delta.audio.data;
                            }
                        }
                    }
                    
                    return {
                        text: fullResponse,
                        audioBase64: generateAudio ? audioData : null
                    };
                }
            }
        } catch (error) {
            this._handleError(error, '处理图像时出错');
            throw error;
        }
    }
    
    /**
     * 翻译文本
     * 为双语翻译创建的便捷方法
     * 
     * @param {string} text 要翻译的文本
     * @param {string} targetLang 目标语言
     * @param {Object} options 可选配置，同processText
     * @returns {Promise<Object>} 返回翻译结果
     */
    async translateText(text, targetLang = '英语', options = {}) {
        // 构建翻译提示词
        const translationPrompt = `请将以下文本翻译成${targetLang}:\n\n${text}`;
        
        // 设置系统提示词
        const systemPrompt = options.systemPrompt || 
            "你是一位专业翻译，请准确地将文本翻译成目标语言，保持原文的含义、语气和格式。";
        
        // 使用processText处理翻译请求
        return this.processText(translationPrompt, {
            ...options,
            systemPrompt
        });
    }
    
    /**
     * 提取图像中的文本
     * 实现OCR功能，从图像中识别并提取文本
     * 
     * @param {string|Object} image 图像数据
     * @param {Object} options 可选配置
     * @returns {Promise<Object>} 返回提取的文本
     */
    async extractTextFromImage(image, options = {}) {
        // 构建OCR提示词
        const ocrPrompt = "请识别并提取图像中的所有文本内容，保持原始格式。";
        
        // 设置系统提示词
        const systemPrompt = options.systemPrompt || 
            "你是一个专业的OCR助手，你的任务是准确识别图像中的所有文字，包括标点符号和特殊字符。";
        
        // 使用processImage处理OCR请求
        return this.processImage(image, ocrPrompt, {
            ...options,
            systemPrompt
        });
    }
    
    /**
     * 生成图像标签
     * 分析图像并生成描述性标签
     * 
     * @param {string|Object} image 图像数据
     * @param {Object} options 可选配置
     * @returns {Promise<Object>} 返回生成的标签
     */
    async generateImageTags(image, options = {}) {
        // 构建标签生成提示词
        const tagPrompt = "请分析这张图片，并生成5-10个最能代表图片内容的标签，按重要性排序。";
        
        // 设置系统提示词
        const systemPrompt = options.systemPrompt || 
            "你是一个专业的图像分析师，擅长从图像中提取关键特征并生成准确的描述性标签。";
        
        // 使用processImage处理标签生成请求
        return this.processImage(image, tagPrompt, {
            ...options,
            systemPrompt
        });
    }
    
    /**
     * 将Base64音频数据转换为WAV文件
     * 
     * @param {string} audioBase64 Base64编码的音频数据
     * @param {string} outputPath 输出文件路径
     * @returns {Promise<string>} 返回生成的文件路径
     */
    async saveAudioToFile(audioBase64, outputPath) {
        try {
            // 解码Base64字符串为Buffer
            const wavBuffer = Buffer.from(audioBase64, 'base64');
            
            // 创建WAV文件写入流
            const writer = new Writer({
                sampleRate: 24000,  // 采样率
                channels: 1,        // 单声道
                bitDepth: 16        // 16位深度
            });
            
            // 创建输出文件流并建立管道连接
            const outputStream = createWriteStream(outputPath);
            writer.pipe(outputStream);
            
            // 写入PCM数据并结束写入
            writer.write(wavBuffer);
            writer.end();
            
            // 使用Promise等待文件写入完成
            await new Promise((resolve, reject) => {
                outputStream.on('finish', resolve);
                outputStream.on('error', reject);
            });
            
            if (this.debug) {
                console.log(`音频文件已成功保存为 ${outputPath}`);
            }
            
            return outputPath;
        } catch (error) {
            this._handleError(error, '保存音频文件时出错');
            throw error;
        }
    }
    
    /**
     * 编码本地图像文件为Base64
     * 
     * @param {string} imagePath 图像文件路径
     * @returns {Promise<string>} 返回Base64编码的图像数据
     * @private
     */
    async _encodeImage(imagePath) {
        try {
            const { readFileSync } = await import('fs');
            const imageFile = readFileSync(imagePath);
            return imageFile.toString('base64');
        } catch (error) {
            this._handleError(error, '编码图像时出错');
            throw error;
        }
    }
    
    /**
     * 处理错误
     * 
     * @param {Error} error 错误对象
     * @param {string} context 错误上下文
     * @private
     */
    _handleError(error, context = '操作失败') {
        if (this.debug) {
            console.error(`${context}: `, error);
        }
        
        // 可以在这里添加更详细的错误处理逻辑
        // 如API错误重试、日志记录等
    }
}

// 导出服务类
export default AliModelService; 