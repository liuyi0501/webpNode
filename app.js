const express = require('express');
const sharp = require('sharp');
const fs = require('fs');
const { config } = require('./config.js');
const app = express();
const port = config.PORT;
const host = config.HOST;
const btoa = require('btoa-lite');
const { GifReader, GifWriter } = require('gifwrap');
const gifToAPNG = require('gif-to-apng');
const { exec } = require('child_process');
const morgan = require('morgan');
const path = require('path');
const winston = require('winston');

const fits = ['cover', 'contain', 'fill', 'inside', 'outside'];

// 创建日志目录
const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}

async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size
  } catch (err) {
      return Infinity;
  }
}

// 配置 winston 记录器
const logger = winston.createLogger({
    level: 'error',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: path.join(logDirectory, 'error.log') })
    ]
});

// 自定义 morgan token 用于获取真实的客户端 IP
morgan.token('real-ip', (req) => {
    const xForwardedFor = req.headers['cf-connecting-ip'] ? req.headers['cf-connecting-ip'] : req.headers['x-forwarded-for'];
    if (xForwardedFor) {
        // 如果存在 x-forwarded-for 头，取第一个 IP 地址（客户端的真实 IP）
        return xForwardedFor.split(',')[0].trim();
    }
    // 否则使用直接的请求 IP 地址
    return req.ip;
});

// 使用 morgan 中间件记录所有请求
app.use(morgan(':real-ip :method :url :status :res[content-length] - :response-time ms', {
    stream: fs.createWriteStream(path.join(logDirectory, 'access.log'), { flags: 'a' })
}));

process.on('uncaughtException', (error) => {
    logger.error({
        message: error.message,
        stack: error.stack
    });
    console.error('捕获到未处理的异常:', error);
  // 做一些清理工作
  // process.exit(1); // 如果你确定要退出进程
});

function requestLogger(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const responseTime = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${responseTime}ms`);
    });
    next();
}

// 将自定义中间件应用到 Express 应用程序中
app.use(requestLogger);

// 判断文件夹是否存在
fs.access(config.EXHAUST_PATH, fs.constants.F_OK, (err) => {
  if (err) {
    console.log(`${config.EXHAUST_PATH} 不存在，将创建文件夹...`);
    // 如果不存在，创建文件夹
    fs.mkdir(config.EXHAUST_PATH, { recursive: true }, (err) => {
      if (err) {
        console.error('创建文件夹失败：', err);
      } else {
        console.log('文件夹创建成功！');
      }
    });
  } else {
    console.log(`${config.EXHAUST_PATH} 已存在。`);
  }
});

function checkFileExists(filePath) {
    try {
        // 使用 fs.accessSync() 方法检测文件是否存在
        fs.accessSync(filePath, fs.constants.F_OK);
        return true;
    } catch (err) {
        // 文件不存在或者无法访问
        return false;
    }
}
function parseQueryString(queryString) {
  const params = {};
  const keyValuePairs = queryString.split('&');
  
  keyValuePairs.forEach(keyValue => {
    const [key, value] = keyValue.split('=');
    params[key] = decodeURIComponent(value);
  });
  
  return params;
}

function checkInput(input) {
    if (typeof config.IMG_PATH === 'string') {
        if (config.ENABLE_PLACEHOLDER == true && !fs.existsSync(config.IMG_PATH + input)) {
            return config.PLACEHOLDER;
        }
        return config.IMG_PATH + input;
        
    } else if (Array.isArray(config.IMG_PATH)) {
        for (const dir of config.IMG_PATH){
            if (fs.existsSync(dir+input)) {
                return dir+input;
            }
        }
        if ( config.ENABLE_PLACEHOLDER == true ){
            return config.PLACEHOLDER;
        } else {
            return config.IMG_PATH + input;
        }
        new Error("file path not found:"+input);
    } else {
        if ( config.ENABLE_PLACEHOLDER == true ){
            return config.PLACEHOLDER;
        } else {
            return config.IMG_PATH + input;
        }
    }
}

// 图片处理路由
app.get('*', async (req, res, next) => {
    try{
    res.setHeader('Timing-Allow-Origin', '*')
    const inputPath = checkInput(req.originalUrl.split('!')[0].split('@')[0].split("?")[0]);
    let str = inputPath.split('.')
    let length = str.length
    const originFormat = str[length-1]
    //console.log("origin format:", str[length-1])
    res.setHeader('X-origin-format', originFormat);
    
    query = parseQueryString( req.originalUrl.split('@')[1] == undefined?"":req.originalUrl.split('@')[1].split("!")[0] )
    if( checkFileExists(inputPath) == true ){
        if( ['png', 'webp', 'jpg', 'jpeg', 'avif'].includes(originFormat) ){
            const quality = query.quality?Number(query.quality):config.QUALITY
            str2 = req.originalUrl.split(".")
            length2 = str2.length
            
            let format =   req.originalUrl.split('!')[1] ? str2[length2 - 1] ? str2[length2 - 1] : null : null
            
            if( format == null ){
                if( query.format ){
                    format = query.foramt
                } else if(req.headers.accept){
                    const supportsAvif = req.headers.accept.includes('image/avif');
          
                    const supportsWebP = req.headers.accept.includes('image/webp');
        
                    // 如果支持WebP，则将图片转换为WebP格式，否则转换为PNG格式
                    format = supportsAvif ? 'avif' : supportsWebP ? 'webp' : 'png';
                    if(config.ENABLE_AVIF == false){
                        format = 'webp'
                    }
                } else {
                    format = 'png'
                }

            }
            res.setHeader('Content-Type', 'image/'+format)
            const w = query.w?Number(query.w):-1
            
            const h = query.h?Number(query.h):-1
            
            let fit = query.fit?query.fit:'fill';
            
            if( fits.includes(fit) == false){
                fit = 'fill'
            }
            
            const outputPath = config.EXHAUST_PATH + '/' + btoa( inputPath + '_' + quality + '_' + w + '_' + h + '_' + fit ) + '.' + format
            
            const refresh = query.refresh?query.refresh:false
            
            let exist
            
            if(refresh == 'true'){
                exist = false
            } else {
                exist = checkFileExists(outputPath) 
            }
            
            res.setHeader('X-Quality', quality);
            res.setHeader('X-Format', format);
            res.setHeader('X-width', w);
            res.setHeader('X-height', h);
            res.setHeader('X-cache', exist == true?"cache":"no");
            if( exist ){
                inputSize = await getFileSize(inputPath);
                outputSize = await getFileSize(outputPath);
                res.setHeader('X-compression-rate', inputSize / outputSize);
                const stream = fs.createReadStream(outputPath);
                stream.pipe(res);
            } else {
                let sharpInstance = sharp(inputPath);
                if (w != -1 || h != -1) {
                    metadata = await sharpInstance.clone().metadata()
                    var finalWidth = w;
                    var finalHeight = h;
                    // 如果高度或者宽度只有一个为 -1，则按原比例缩放
                    if (w === -1 || h === -1) {
                        if (w === -1) {
                            finalWidth = Math.round(metadata.width * h / metadata.height);
                        } else {
                            finalHeight = Math.round(metadata.height * w / metadata.width);
                        }
                    }
                    
                    // 按照规定大小缩放
                    sharpInstance = sharpInstance.resize({
                        width: finalWidth,
                        height: finalHeight,
                        fit: fit
                    })
                }
                
                if( format == 'webp' ){
                    sharpInstance = sharpInstance.webp({ quality: quality })
                }
                if( format == 'avif' ){
                    sharpInstance = sharpInstance.avif({ quality: quality })
                }
                if( format == 'png' ){
                    sharpInstance = sharpInstance.png({ quality: quality })
                }
                sharpInstance.toFile(outputPath).then(async ()=>{
                    inputSize = await getFileSize(inputPath);
                    outputSize = await getFileSize(outputPath);
                    res.setHeader('X-compression-rate', inputSize / outputSize);
                    const stream = fs.createReadStream(outputPath);
                    stream.pipe(res);
                })
            }
        } else 
        /**********************************************************/
        if( ['gif'].includes(originFormat) ){
            const quality = query.quality?Number(query.quality):config.QUALITY
            str2 = req.originalUrl.split(".")
            length2 = str2.length
            
            var format =   req.originalUrl.split('!')[1] ? str2[length2 - 1] ? str2[length2 - 1] : null : null
            
            if( format == null ){
                if( query.format ){
                    format = query.foramt
                } else if(req.headers.accept){
                    const supportsAvif = req.headers.accept.includes('image/avif');
                    const supportsWebp = req.headers.accept.includes('image/webp');
                    format = supportsAvif ? 'avif' : supportsWebp ? 'webp' : 'gif';
                    if(config.ENABLE_AVIF == false){
                        format = 'webp'
                    }
                } else {
                    format = 'gif'
                }
            }
            if( format == 'webp' || format == 'avif' || format == 'gif'){
                const w = query.w?Number(query.w):-1
            
                const h = query.h?Number(query.h):-1
                
                const outputPath = config.EXHAUST_PATH + '/' + btoa( inputPath + '_' + quality + '_' + w + '_' + h ) + '.' + format
                var tempPath = config.TEMP_PATH + '/' + btoa( inputPath + '_' + quality + '_' + w + '_' + h ) + '.' + originFormat
                
                //const outputPath = config.EXHAUST_PATH + '/' + btoa( inputPath + '_' + quality ) + '.' + format
                const refresh = query.refresh?query.refresh:false
                
                
                
                if(refresh == 'true'){
                    exist = false
                } else {
                    exist = checkFileExists(outputPath) 
                }
                
                res.setHeader('X-Quality', quality);
                res.setHeader('X-Format', format);
                res.setHeader('X-width', w);
                res.setHeader('X-height', h);
                res.setHeader('X-cache', exist == true?"cache":"no");
                res.setHeader('Content-Type', 'image/'+format)
                if( exist ){
                    inputSize = await getFileSize(inputPath);
                    outputSize = await getFileSize(outputPath);
                    res.setHeader('X-compression-rate', inputSize / outputSize);
                    const stream = fs.createReadStream(outputPath);
                    stream.pipe(res);
                } else {
                    if (w != -1 || h != -1) {
                        sharpInstance = sharp(inputPath);
                        metadata = await sharpInstance.clone().metadata()
                        var finalWidth = w;
                        var finalHeight = h;
                        // 如果高度或者宽度只有一个为 -1，则按原比例缩放
                        if (w === -1 || h === -1) {
                            if (w === -1) {
                                finalWidth = Math.round(metadata.width * h / metadata.height);
                            } else {
                                finalHeight = Math.round(metadata.height * w / metadata.width);
                            }
                        }
                    }
                    exec(`ffmpeg -i ${inputPath} ${format == 'avif'? "-c:v libsvtav1" : ""}  -vf "scale=${finalWidth?finalWidth:w}:${finalHeight?finalHeight:h}" -q:v ${quality} ${outputPath} `, async (error, stdout, stderr) => {
                        if (error) {
                            console.log("Convert GIF Error: ", error)
                            inputSize = await getFileSize(inputPath);
                            res.setHeader('X-compression-rate', inputSize / inputSize);
                            const stream = fs.createReadStream(inputPath);
                            stream.pipe(res);
                        } else {
                            inputSize = await getFileSize(inputPath);
                            outputSize = await getFileSize(outputPath);
                            res.setHeader('X-compression-rate', inputSize / outputSize);
                            const stream = fs.createReadStream(outputPath);
                            stream.pipe(res);
                        }
                    });
                }
            }
        } else 
        /******************************/ // other Files
        {
            const stream = fs.createReadStream(inputPath);
            stream.pipe(res);
        }
    } else {
        res.status(404).send('File not found')
    }
    } catch(err) {
        next(err); // 将捕获的错误传递给错误处理中间件
    }
});

app.use((err, req, res, next) => {
    logger.error({
        message: err.message,
        method: req.method,
        url: req.url,
        headers: req.headers,
        stack: err.stack,
        ip: req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip
    });
    res.status(500).send('Internal Server Error');
    console.error(err.stack);
});


app.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});
