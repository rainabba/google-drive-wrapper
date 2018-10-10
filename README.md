# node-cloudfs-drive
[![GitHub issues](https://img.shields.io/github/issues/rainabba/node-cloudfs-drive.svg)](https://github.com/rainabba/node-cloudfs-drive/issues) [![GitHub stars](https://img.shields.io/github/stars/rainabba/node-cloudfs-drive.svg)](https://github.com/rainabba/node-cloudfs-drive/stargazers) [![GitHub license](https://img.shields.io/github/license/rainabba/node-cloudfs-drive.svg)](https://github.com/rainabba/node-cloudfs-drive/blob/master/LICENSE.txt) [![Twitter](https://img.shields.io/twitter/url/https/github.com/rainabba/node-cloudfs-drive.svg?style=social)](https://twitter.com/intent/tweet?text=Wow:&url=https%3A%2F%2Fgithub.com%2Frainabba%2Fnode-cloudfs-drive)

Library implementing Promises to make working with Google drive more like working with a local fs (paths, folders, files, and standard operations.) Other cloud services to come as I have time or others contribute. Please see the CONTRIBUTE.md file.

## HISTORY
This project wouldn't exist if not for https://github.com/mhdawson/google-drive-wrapper. I did fork initially, but so much changed so quickly that I decided a PR made no sense and this was to live on as its own project. Thanks to Michael Dawson for giving me a kick-off point with this.

## ISSUES AND SUPPORT
Please see [CONTRIBUTING.md](https://github.com/rainabba/node-cloudfs-drive/blob/master/CONTRIBUTING.md)

The Google Drive constructor requires:
* auth - googleAuth.OAuth2 object to be used to access the google services (see not below)
* google - instance of googleapis to be used to access the google services

Caching is provided by [node-cache](https://github.com/mpneuried/nodecache) and reduces API calls substancially for getMetaForFilename as well as making things almost instant compared to external API calls, much as a reverse proxy between this and the API would.

## USE

```bash
npm install node-cloudfs-drive --save
```

```javascript
let { google } = require('googleapis');

//I suggest using someone elses's token generator until mine is at least 1.0.0, but it does work for testing
require('oauth-token-generator-google')( googleAuthCredentialsPath ).then( auth => { 
	let drive = require('node-cloudfs-drive').Drive( auth, google );
	// drive will expose this projects helper methods as well as the actual the googleapis drive object
    
    drive.mkdir( testFolderA )
    .then( folder => {
		// Your Google Drive folder object
    })
    .catch(err => {
    	console.error(err);
    });
})
.catch(err => { 
	console.error(err);
});
```


## GOOGLE AUTH TOKEN
Overview: [https://developers.google.com/identity/protocols/OAuth2](https://developers.google.com/identity/protocols/OAuth2)

After 3 attempts with node.js and Googel APIs, I decided to learn oauth a bit more and ended up writing my own library to manage the tokens for me. A big part of this was just my ignorance and lack of explanations that worked for me (turns out that the Google API version used in various samples/projects was a big factor here). Given my experience and the tutorials out there which can provide more detail, I won't get into a lot of detail but I do want to summarize what I've learned in recent history. Following other tutorials on the web, you will want to generate a client_secret.json file which Google will provide for you to download from the Google Developer console [https://developers.google.com/identity/protocols/OAuth2](https://developers.google.com/identity/protocols/OAuth2). If you use the same oauth library this projects test suite does, you will place that client_secret.json file in a folder called private at the root of this/your project, and you reference that file when you instantiate the oauth client. The library will attempt to use this client_secret.json file to retrieve tokens from Google which will then be saved next to the .json file with the same name, but .token extension and used in future constructor calls and to renew tokens. This library will not only help you create that token, but will look for it and attempt to use it when it is available. This library takes a novel approach to retrieving the initial token by prompting you in a node/webkit development console with a URL to visit and asking you to bring the code from that URL back to the console, then assign it to an object before resuming the debugger (directions are provided on the console in this mode). To that end, you can use the commands `npm run dev` or `npm test:dev` to run this library and connect with the console so that you can provide the code needed to retrieve a token. This manual process only needs to be done to retrieve the initial token so it is more of a utility in that respect. Once you have the token you can use that file in other projects by moving it (can't use it in many places at typically). More discussion about tokens is out of the scope of this document.