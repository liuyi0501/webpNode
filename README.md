# webpNode
A tool to convert your JPG/PNG/GIF to compressed WebP/AVIF format.

## Features

* Provide images in next-generation format without modifying the original code
* You can set multiple image paths to access the image folder
* convert GIF to Webp or AVIF
## Usage

Make sure you've installed Node.js and ffmpeg
```sh
apt install nodejs npm
apt install ffmpeg
npm install
node app.js
```

## Configure
webpNode can be configured at `config.js`
```js
exports.config = {
    "HOST": "0.0.0.0", //You can bind the listening host
    "PORT": "3339", //You can bind the listening port
    "QUALITY": 80, //You can set the default quality
    "IMG_PATH": ["/path/to/images", "/path/to/other/folder", "/path/to/..."],//The program will gradually search for the corresponding directory
    "EXHAUST_PATH": "./exhaust", //Where to save converted images
    "ALLOWED_TYPES": ["jpg","png","jpeg","gif"],
    "ENABLE_AVIF": false, //Automatically provide images in AVIF format
    "ENABLE_PLACEHOLDER": true, //When the accessed file cannot be accessed, the provided image
    "PLACEHOLDER": "./placeholder.png" //Where are the placeholder image
}
```

Suppose your website and image has the following pattern.

| Image Path                 | Website Path                   |
| -------------------------- | ------------------------------ |
| `/path/to/image/logo.png`  | `https://example.com/logo.png` |

Also

| Image Path                          | Website Path                     |
| ----------------------------------- | -------------------------------- |
| `/path/to/other/folder/logo-2.png`  | `https://example.com/logo-2.png` |


* IMG_PATH can be a String to folder or an Array includes a lot of folders
* `./exhaust` is cache folder for output images, you can change  `./exhaust` to `/some/other/path/to/exhaust`

## Params

There are a lot of params to set.

we support the following params:
- h (height) ( px )
- w (width) ( px )
- quality ( 0 ~ 100 )
- format (if annotation IS NOT setted) ( png | webp | avif )
- fit ( without GIF ) ( cover | contain | fill | inside | outside )
- refresh (refresh cache) ( true | anyother )

You can add params after '@'

Also you can set annotation in the url just add ! after image

example:

| Origin                           | Custom Settings (width=720 quality=60 format=avif)                    |
| -------------------------------- | --------------------------------------------------------------------- |
| `https://example.com/image.png`  | `https://example.com/image.png@w=720&quality=60!some-annotation.avif` |

** If annotation is setted, it MUST like '!name.format' **  
** If annotation and format is NOT setted,  the format will set Avif(if enabled), Webp or png (if not support Avif or Webp)**

Now the server should be running on `0.0.0.0:3339`, visiting `http://0.0.0.0:3339/image.png` will see the optimized version of `/path/to/images/image.png`, you can now add reverse proxy to make it public, for example, let Nginx to `proxy_pass http://127.0.0.1:3339/;`, and you can connvert your image to next-generaton smoothly!