// Copyright 2016 the project authors as listed in the AUTHORS file.
// All rights reserved. Use of this source code is governed by the
// license that can be found in the LICENSE file.

const fs = require('fs'),
    path = require('path'),
    mimetype = require('mime-types'),
    async = require('async'),
    apiRequestFields = 'id,name,size,parents,properties,version',
    NodeCache = require("node-cache"),
    ratelimit = require('promise-ratelimit'),
    retry = require('retry');

//This is to leave room for adding other services, but using the same method signatures
let drive,
    ncfs = {
        Drive: {
            pathCache: null,
            throttle: null, // setup in constructor to make rate user controllable
        },
    };


ncfs.Drive.getFileMetadata = function(fileId) {
    let self = ncfs.Drive;
    return new Promise((resolve, reject) => {
        self.throttle().then( () => {
            output = self.drive.files.get({ fileId: fileId, fields: apiRequestFields })
                .then(response => { resolve(response.data); })
                .catch(err => {
                    err.message = "Error in getFileMetadata.files.get()";
                    reject(err);
                });
        });
    });
}

// options can include parents: [] and keepFileAfterUpload: true to keep uploaded files in their source location
ncfs.Drive.uploadFile = function(fileName, localPath, options) {
    let self = ncfs.Drive;
    return new Promise((resolve, reject) => {
        let parts = self.pathSplit(fileName),
            mkdirPromise = new Promise((resolve, reject) => {
                if (parts.length > 1) {
                    //This is async, but I expect the GoogleAPI to queue transactions so I don't see this failing to complete before the following create call is made
                    let newFolder = fileName.replace('/' + parts[parts.length - 1], '');
                    self.mkdirp(newFolder)
                        .then(file => {
                            if (typeof options != 'undefined' && options.permissions && Array.isArray(options.permissions)) {
                                self.permissions.create(file.id, options.permissions)
                                    .then(file => {
                                        resolve([file.id]);
                                    })
                                    .catch(err => {
                                        console.error(err);
                                        reject(err);
                                    });
                            } else {
                                resolve([file.id]);
                            }
                        })
                        .catch(err => {
                            reject(err);
                        });
                } else {
                    resolve(null);
                }
            });

        mkdirPromise.then(newParentId => {
                let extension = '',
                    errorOccurred = false,
                    handlePipeError = function(err) {
                        if (!errorOccurred) {
                            errorOccurred = true;
                            err.fileName = fileName;
                            err.localPath = localPath;
                            reject(err);
                        }
                    };

                var mimeType = 'application/octet-stream';
                if (typeof localPath === 'string') {
                    var uploadStream = fs.createReadStream(localPath);
                    mimeType = mimetype.lookup(localPath.substring(localPath.indexOf('.')));
                    if (mimeType === false) {
                        mimeType = 'application/octet-stream';
                    }
                } else {
                    uploadStream = localPath;
                }
                uploadStream.on('error', handlePipeError);

                // this is to support converting a file to a google doc
                var convertOnUpload = false;
                var uploadMimeType = mimeType;
                if (options.convert === true) {
                    // this is for importing google docs
                    convertOnUpload = true;
                    if (options.mimeType) {
                        uploadMimeType = options.mimeType;
                    }
                }

                self.getMetaForFilename(fileName)
                    .then(file => {
                        if (file) { //File already exists so update
                            self.throttle().then( () => {
                                self.drive.files.update({
                                        fileId: file.id,
                                        media: {
                                            mimeType: mimeType,
                                            body: uploadStream
                                        }
                                    })
                                    .then(response => {
                                        if (response.status == "200") {
                                            if (!options.keepFileAfterUpload) {
                                                fs.unlink(localPath, done => {
                                                    response.data.localFileDeleted = true;
                                                    resolve(response.data);
                                                });
                                            } else {
                                                response.data.localFileDeleted = false;
                                                resolve(response.data);
                                            }
                                        } else {
                                            err.message = "Error uploading file from ncfs.Drive.uploadFile()";
                                            err.response = response;
                                            reject(err);
                                        }
                                    })
                                    .catch(err => {
                                        console.dir(err);
                                        err.message = "Error uploading file from ncfs.Drive.uploadFile()";
                                        err.response = response;
                                        reject(err);
                                    });
                            });
                        } else { //File doesn't already exist so create
                            let newFile = {
                                resource: options.resource || {},
                                media: {
                                    mimeType: mimeType,
                                    body: uploadStream
                                },
                                fields: apiRequestFields
                            }
                            newFile.resource.name = path.basename(fileName + extension);
                            newFile.resource.parents = newParentId || newFile.resource.parents || options.parents; // For backward compatibility
                            newFile.resource.spaces = 'drive';
                            newFile.resource.mimeType = uploadMimeType;
                            newFile.resource.convert = convertOnUpload;
                            newFile.resource.originallocalPath = path.basename(localPath);
                            self.drive.files.create(newFile)
                                .then(response => {
                                    if (response.status == "200") {
                                        if (!options.keepFileAfterUpload) {
                                            fs.unlink(localPath, done => {
                                                response.data.localFileDeleted = true;
                                                resolve(response.data);
                                            });
                                        } else {
                                            response.data.localFileDeleted = false;
                                            resolve(response.data);
                                        }
                                    } else {
                                        err.message = "Error uploading file from ncfs.Drive.uploadFile()";
                                        err.response = response;
                                        reject(err);
                                    }
                                })
                                .catch(err => {
                                    console.dir(err);
                                    err.message = "Error uploading file from ncfs.Drive.uploadFile()";
                                    err.response = response;
                                    reject(err);
                                });
                        }
                    })
            })
            .catch(err => { reject(err); });

    });
}

ncfs.Drive.downloadFile = function(fileId, localPath) {
    let self = ncfs.Drive;
    return new Promise((resolve, reject) => {
        var extension = '';
        self.getFileMetadata(fileId)
            .then(meta => {
                var output = self.drive.files.get({ fileId: fileId, alt: 'media' })
                    .then(() => {
                        // do nothing but we need this to avoid console output
                        // in error conditions
                    });

                // common error handler for pipes
                var errorOccurred = false;
                var handlePipeError = function(err) {
                    if (!errorOccurred) {
                        errorOccurred = true;
                        err.localPath = localPath;
                        reject(err);
                    }
                };

                var requestOutput = output;
                output.on('error', handlePipeError);
                output.on('end', function() {
                    // make sure we process any error event first
                    setImmediate(function() {
                        if (!errorOccurred) {
                            if (requestOutput.response.data.statusCode != 200) {
                                reject({ error: "Status code was :" + requestOutput.response.data.statusCode, message: requestOutput.response.data.statusMessage, localPath: localPath });
                            } else {
                                resolve({ meta: meta, targetFile: localPath });
                            }
                        }
                    });
                });

                output.pipe(fs.createWriteStream(localPath));
            });
    });
}

ncfs.Drive.getMetaForFilename = function(drivePath) {
    let self = ncfs.Drive;
    return new Promise((resolve, reject) => {

        // Get the names in the path, in order. The shift() is needed because the full path is injected in the first indice in the pathSplit function
        let fileComponents = this.pathSplit(drivePath);

        //Recursive function
        function findNext(parent, fileComponents, index) {
            let query = 'name = \'' + fileComponents[index] + '\'';
            if (parent !== null) {
                query = query + ' and \'' + parent + '\' in parents' + ' and trashed != true';
            }

            let response = cacheGet(query);
            if (response) {
                // cache hit
                handleResponse(response, false);
            } else {
                // cache miss
                self.throttle().then( () => {
                    self.drive.files.list({
                            spaces: 'drive',
                            pageSize: self.options.pageSize,
                            q: query,
                        })
                        .then(response => {
                            handleResponse({ data: response.data });
                        })
                        .catch(err => {
                            err.source = 'node-cloudfs-drive:ncfs.Drive.js:getMetaForFilename:files.list';
                            reject(err);
                        });
                });
            }

            function handleResponse(res, setCache = true) {
                if (setCache && res.data.files[0]) {
                    cacheSet(query, { data: res.data }); // Re-wrap to ensure we're only getting data
                }

                if (!res.data.files.length || res.data.files.length == 0) {
                    // No error, just no match to return so giving up
                    resolve(null);
                } else if (typeof res != 'undefined' && res.data && res.data.files && index < (fileComponents.length - 1)) {
                    // Found a folder, but not the final. Keep searching.
                    index = index + 1;
                    findNext(res.data.files[0].id, fileComponents, index);
                } else {
                    //Found what we wanted so return it
                    resolve(res.data.files[0]);
                }
            }

        }

        //Initiate recursion
        findNext(null, fileComponents, 0);
    });
}



ncfs.Drive.listFilesBypath = function(gdrivePath, complete) {
    let self = ncfs.Drive;
    return new Promise((resolve, reject) => {
        self.getMetaForFilename(gdrivePath)
            .then(parentMeta => {
                var fileList = new Array();
                var getNextFile = function(nextPageToken) {
                    let query = '\'' + parentMeta.id + '\' in parents' + ' and trashed != true' +
                        ' and mimeType != \'application/vnd.google-apps.folder\'';
                    let response = cacheGet(query);
                    if (response) {
                        handleResponse(response);
                    } else {
                        self.throttle().then( () => {
                            self.drive.files.list({
                                    pageSize: self.options.pageSize * 2,
                                    pageToken: nextPageToken,
                                    q: query,
                                    space: 'drive'
                                })
                                .then(response => {
                                    handleResponse(response, true);
                                })
                                .catch(err => {
                                    reject(err);
                                });
                        });
                    }

                    function handleResponse(res, setCache = true) {
                        if (setCache && res.data.files) {
                            cacheSet(query, { data: res.data }); // Re-wrap to ensure we're only getting data
                        }
                        var files = res.data.files;
                        if (files.length === 0) {
                            resolve(fileList);
                        }

                        fileList = fileList.concat(files);

                        if (res.data.nextPageToken) {
                            getNextFile(res.data.nextPageToken);
                        } else {
                            resolve(fileList);
                        }
                    }
                }

                // ok now start by getting the first page
                getNextFile(null);
            })
            .catch(err => {
                err.message = 'Error in listFilesBypath().getMetaForFilesname().'
                reject(err);
            });
    });
}

ncfs.Drive.listFilesByFolderId = function(gdrivePath, complete) {
    let self = ncfs.Drive;
    return new Promise((resolve, reject) => {
        var fileList = new Array();
        var getNextFile = function(nextPageToken) {
            let query = '\'' + parentMeta.id + '\' in parents' + ' and trashed != true' +
                ' and mimeType != \'application/vnd.google-apps.folder\'';
            let response = cacheGet(query);
            if (response) {
                handleResponse(response)
            } else {
                self.throttle().then( () => {
                    self.drive.files.list({
                            pageSize: ncfs.Drive.options.pageSize * 2,
                            pageToken: nextPageToken,
                            q: query,
                            space: 'drive'
                        })
                        .then(response => {
                            handleResponse(response, true);
                        })
                        .catch(err => {
                            err.message = 'Error in listFilesByFolderId().drive.files.list().'
                            reject(err);
                        });
                });
            }

            function handleResponse(res, setCache = true) {
                if (setCache && res.data.files) {
                    cacheSet(query, { data: res.data }); // Re-wrap to ensure we're only getting data
                }
                var files = res.data.files;
                if (files.length === 0) {
                    resolve(fileList);
                }

                fileList = fileList.concat(files);

                if (res.data.nextPageToken) {
                    getNextFile(res.data.nextPageToken);
                } else {
                    resolve(fileList);
                }
            }
        }

        // ok now start by getting the first page
        getNextFile(null);
    });
}

// Takes a single name and objectid of parent, then returns the created object
ncfs.Drive.mkdir = function(folderName, parentId) {
    let self = ncfs.Drive;
    return new Promise((resolve, reject) => {
        if (!folderName) {
            reject(new Error("node-cloudfs-drive:mkdir::folderName is required"));
        }

        let fileMetadata = {
            name: folderName.replace(/^\//g, ''),
            mimeType: 'application/vnd.google-apps.folder'
        };
        if (parentId) {
            fileMetadata.parents = [parentId];
        }
        self.throttle().then( () => {
            self.drive.files.create({
                    resource: fileMetadata,
                    fields: apiRequestFields
                })
                .then(folder => {
                    resolve(folder.data);
                })
                .catch(err => {
                    console.error(err);
                    reject(err);
                });
        });
    });
};

//Accepts a string path from root (/), traverses the path and creates missing folders along the route,
//  then returns the target Drive folder object once found/created
ncfs.Drive.mkdirp = function(localPath) {
    let self = ncfs.Drive;
    return new Promise((resolve, reject) => {
        // Get the names in the path, in order. The shift() is needed because the full path is injected in the first indice in the pathSplit function
        let fileComponents = self.pathSplit(localPath);

        //Recursive function
        var findNext = function(parent, fileComponents, index) {
            var folderName = fileComponents[index],
                query = 'name = \'' + folderName + '\' and trashed != true and \'' + (parent ? parent : 'root') + '\' in parents';
            if (folderName) {

                let response = cacheGet(query);
                if (response) {
                    handleResponse(response);
                } else {
                    self.throttle().then( () => {
                        self.drive.files.list({
                                spaces: 'drive',
                                pageSize: self.options.pageSize,
                                q: query
                            })
                            .then(response => {
                                handleResponse(response, true);
                            })
                            .catch(err => {
                                err.source = 'node-cloudfs-drive:ncfs.Drive.js:getMetaForFilename:files.list';
                                reject(err);
                            });
                    });
                }

            }

            function handleResponse(res, setCache = true) {
                if (!res.data.files.length || res.data.files.length == 0) {
                    //Folder is missing. Create and continue search
                    if (folderName == '/') {
                        index = index + 1;
                        findNext(res.data.files[0].id, fileComponents, index);
                    } else if (folderName) {
                        self.mkdir(folderName, folderName == '/' || !parent ? 'root' : parent)
                            .then(folder => {
                                index = index + 1;
                                if (fileComponents[index]) {
                                    findNext(folder.id, fileComponents, index);
                                } else {
                                    resolve(folder);
                                }
                            })
                            .catch(err => {
                                err.message = 'Error in node-cloudfs-drive:mkdirp:mkdir()';
                                reject(err)
                            });
                    }
                } else if (typeof res != 'undefined' && res.data && index < (fileComponents.length - 1)) {
                    //Folder is found, increment and contine search
                    index = index + 1;
                    findNext(res.data.files[0].id, fileComponents, index);
                } else if (res.data.files[0]) {
                    resolve(res.data.files[0]);
                } else {
                    reject(new Error("node-cloudfs-drive:mkdirp():546::Unknown Error"));
                }
            }

        }

        //Initiate recursion
        findNext(null, fileComponents, 0);
    });
}

//Accepts 2 strings with full paths from root, updates the parents and renames if needed
ncfs.Drive.mv = function(sourceFilePath, destFilePath) {
    let self = ncfs.Drive;
    return new Promise((resolve, reject) => {
        self.getMetaForFilename(sourceFilePath)
            .then(srcFile => {
                if (srcFile) {
                    self.getMetaForFilename(destFilePath)
                        .then(dstFile => {
                            if (!dstFile) {
                                //destination doesn't exist so go for it
                                self.getMetaForFilename(path.dirname(destFilePath))
                                    .then(dstFolder => {
                                        self.getFileMetadata(srcFile.id)
                                            .then(srcFile => {
                                                let updateAction = {
                                                    fileId: srcFile.id,
                                                    addParents: dstFolder.id,
                                                    removeParents: srcFile.parents.join(','),
                                                    resource: { name: path.basename(destFilePath) }
                                                };
                                                self.throttle().then( () => {
                                                    self.drive.files.update(updateAction, (err, res) => {
                                                        if (err) { reject(err); }
                                                        resolve(res.data);
                                                    });
                                                });
                                            })
                                    })
                                    .catch(err => {
                                        reject(err);
                                    });
                            } else {
                                //destination exists so reject with message
                                reject(new Error('destFilePath already exists: ' + destFilePath));
                            }
                        })
                        .catch(err => {
                            reject(err);
                        });
                } else {
                    reject(new Error('sourceFilePath not found: ' + sourceFilePath));
                }
            })
            .catch(err => {
                reject(err);
            })
    });
}

//Accepts a string path as input and returns an array where the first index is the full path and the remaining are the parts of the path parsed by the path.sep value
ncfs.Drive.pathSplit = function(path) {
    let sep = '/',
        parts = path.split(sep);
    if (parts[0] == '' || parts[0] == sep) { parts.shift(); } //Remove that first, empty element
    // if ( parts[0] != path ) { parts.unshift( path ); } // Put the full path in the first index. Single-depth paths such as /foo will require this exclusion
    return parts;
}


function cacheSet(key, val) {
    ncfs.Drive.pathCache.set('node-cloudfs-drive::' + key, val);
}

function cacheGet(key) {
    let res = ncfs.Drive.pathCache.get('node-cloudfs-drive::' + key);
    if (typeof res != 'undefined' && res.data && res.data.files) { // cache hit
        res.fromCache = true;
        for (let i = 0; i < res.data.files.length; i++) {
            res.data.files[i].fromCache = true;
        }
    }
    return res;
}

// EXAMPLES of permissions
// 
// var permissions = [
//   {
//     'type': 'user',
//     'role': 'writer',
//     'emailAddress': 'user@example.com'
//   }, {
//   {
//     'type': 'anyone',
//     'role': 'reader',
//     'allowFileDiscovery': false,
//     'expirationTime': moment().add( { hours: 48 })
//   }, {
//     'type': 'domain',
//     'role': 'writer',
//     'domain': 'example.com'
//   }
// ];
ncfs.Drive.permissions = {
    create: function(fileId, permissions) {
        let self = ncfs.Drive;
        return new Promise((resolve, reject) => {
            async.mapSeries(
                permissions,
                (permission, callback) => {
                    self.throttle().then( () => {
                        self.drive.permissions.create({
                                resource: permission,
                                fileId: fileId,
                                fields: 'id'
                            },
                            function(err, res) {
                                if (err) {
                                    console.error(err);
                                    callback(err);
                                } else {
                                    callback(null, { permission: permission, res: res });
                                }
                            }
                        )
                    });
                },
                (err, results) => {
                    if (err) {
                        console.dir(err);
                        reject(err);
                    } else {
                        resolve({ id: fileId, permissions: results });
                    }
                }
            );
        });
    } // End Outter Drive.permissions.create
} // End permissions

module.exports = {
    Drive: function(auth, google, opt) {
        let self = ncfs.Drive;
        if (typeof auth == 'object' && typeof google == 'object') {
            let driveApi = google.drive({ version: 'v3', auth: auth }),
                defaultOptions = {
                    throttle: 2000,
                    cacheTTL: 60 * 60 * 24,
                    cacheCheckperiod: 60 * 60,
                    pageSize: 20,
                    backoff: {
                        retries: 3,
                        factor: 3
                    }
                },
                options = Object.assign(defaultOptions, opt);

            // wrap API calls in retry for backoff
            retry.wrap( driveApi.permissions.create, options.backoff );
            retry.wrap( driveApi.files.list, options.backoff );
            retry.wrap( driveApi.files.get, options.backoff );
            retry.wrap( driveApi.files.create, options.backoff );
            retry.wrap( driveApi.files.update, options.backoff );
            ncfs.Drive.options = options;
            ncfs.Drive.drive = driveApi;           
            ncfs.Drive.throttle = ratelimit(options.throttle); // miliseconds
            ncfs.Drive.pathCache = new NodeCache({ stdTTL: options.cacheTTL, checkperiod: options.cacheCheckperiod })           

            return ncfs.Drive;
        } else {
            throw new Error({ message: 'node-cloudfs-drive::auth object and google parameters are required.' });
        }
    }
};