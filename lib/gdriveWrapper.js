// Copyright 2016 the project authors as listed in the AUTHORS file.
// All rights reserved. Use of this source code is governed by the
// license that can be found in the LICENSE file.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const mimetype = require('mime-types');

let gdriveWrapper = function(auth, google, password) {
    if (typeof auth == 'object' && typeof google == 'object') {
        this.drive = google.drive({ version: 'v3', auth: auth });
        this.password = password;
        return this;
    } else {
        throw new Error({ errorMessage: 'google-drive-wrapper::auth object and google parameters are required.' });
    }
}

gdriveWrapper.prototype.getFileMetadata = function(fileId) {
    return new Promise((resolve, reject) => {
        output = this.drive.files.get({ fileId: fileId })
            .then(file => { resolve(file); })
            .catch(err => {
                err.errorMessage = "Error in getFileMetadata.files.get()";
                reject(err);
            });
    });
}

gdriveWrapper.prototype.uploadFile = function(localPath, localPath, options) {
    return new Promise((resolve, reject) => {
        var extension = '';
        // common error handler for pipes
        var errorOccurred = false;
        var handlePipeError = function(err) {
            if (!errorOccurred) {
                errorOccurred = true;
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

        if (options.compress === true) {
            var zip = zlib.createGzip();
            uploadStream = uploadStream.pipe(zip);
            uploadStream.on('error', handlePipeError);
            extension = '.gz';
        }

        if (options.encrypt === true) {
            var enc = crypto.createCipher('aes-256-cbc', this.password);
            uploadStream = uploadStream.pipe(enc);
            uploadStream.on('error', handlePipeError);
            extension = extension + '.enc';
        }

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
        let newFile = {
            resource: options.resource || {},
            media: {
                mimeType: mimeType,
                body: uploadStream
            },
            fields: 'id,name,size,parents,properties'
        }
        newFile.resource.name = path.basename(localPath + extension);
        newFile.resource.parents = newFile.resource.parents || options.parents; // For backward compatibility
        newFile.resource.spaces = 'drive';
        newFile.resource.mimeType = uploadMimeType;
        newFile.resource.convert = convertOnUpload;
        newFile.resource.originallocalPath = path.basename(localPath);

        this.drive.files.create(newFile)
            .then(response => {
                if (response.status == "200") {
                    resolve(response.data);
                } else {
                    console.dir(err);
                    err.errorMessage = "Error uploading file from gdriveWrapper.uploadFile()";
                    err.response = response;
                    reject(err);
                }
            })
            .catch(err => {
                console.dir(err);
                err.errorMessage = "Error uploading file from gdriveWrapper.uploadFile()";
                err.response = response;
                reject(err);
            });
    });
}

gdriveWrapper.prototype.downloadFile = function(fileId, localPath) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;
        var extension = '';
        this.getFileMetadata(fileId)
            .then(meta => {
                var output = wrapperThis.drive.files.get({ fileId: fileId, alt: 'media' })
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
                                reject({ error: "Status code was :" + requestOutput.response.data.statusCode, errorMessage: requestOutput.response.data.statusMessage, localPath: localPath });
                            } else {
                                resolve({ meta: meta, targetFile: localPath });
                            }
                        }
                    });
                });

                var name = meta.name;
                var lastExtension = name.substring(name.lastIndexOf('.'));
                if (lastExtension === '.enc') {
                    var dec = crypto.createDecipher('aes-256-cbc', wrapperThis.password);
                    output = output.pipe(dec);
                    output.on('error', handlePipeError);
                    name = name.substring(0, name.lastIndexOf('.'));
                }

                var lastExtension = name.substring(name.lastIndexOf('.'));
                if (lastExtension === '.gz') {
                    var unzip = zlib.createGunzip();
                    output = output.pipe(unzip);
                    output.on('error', handlePipeError);
                }

                var outputFile = fs.createWriteStream(localPath);
                output.pipe(outputFile);
            });
    });
}

// must start at root
gdriveWrapper.prototype.getMetaForFilename = function(localPath) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;

        if (localPath[0] === '/') {
            localPath = localPath.substring(1);
        }
        let fileComponents = localPath.split('/');

        var findNext = function(parent, fileComponents, index) {
            var query = 'name = \'' + fileComponents[index] + '\'';
            if (parent !== null) {
                query = query + ' and \'' + parent + '\' in parents' + ' and trashed != true';
            }
            wrapperThis.drive.files.list({
                    spaces: 'drive',
                    pageSize: 10,
                    q: query
                },
                function(err, response) {
                    if (err !== null) {
                        reject(err);
                    }
                    if (!response.data.files.length || response.data.files.length == 0) {
                        reject({ error: 'File component not found:' + fileComponents[index] });
                    }
                    if (index < (fileComponents.length - 1)) {
                        index = index + 1;
                        findNext(response.data.files[0].id, fileComponents, index);
                    } else {
                        resolve(response.data.files[0]);
                    }
                }
            );
        }

        findNext(null, fileComponents, 0);
    });
}

gdriveWrapper.prototype.downloadNewFiles = function(gdrivePath, localPath) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;

        // get list of existing files so we only download new files
        let existinglocalPath = path.join(localPath, '.existing'),
            existingFiles = new Array(),
            fileLookup = new Object(),
            downloadedFiles = [];

        try {
            existingFiles = fs.readFileSync(existinglocalPath).toString().split(',');
            for (var i = 0; i < existingFiles.length; i++) {
                fileLookup[existingFiles[i]] = true;
            }
        } catch (err) {
            // ENOENT (-2) is ok as we just don't have a list of existing files yet
            if (err.errno !== -2) {
                reject(err);
            }
        }

        this.getMetaForFilename(gdrivePath)
        then(parentMeta => {
                if (err) {
                    reject(err);
                }
                var getNextFile = function(nextPageToken) {
                    wrapperThis.drive.files.list({
                            pageSize: 10,
                            pageToken: nextPageToken,
                            q: '\'' + parentMeta.id + '\' in parents' + ' and trashed != true' +
                                ' and mimeType != \'application/vnd.google-apps.folder\'',
                            space: 'drive'
                        },
                        function(err, response) {
                            if (err) {
                                err.response = response;
                                reject(err);
                            }
                            var files = response.data.files;
                            if (files.length === 0) {
                                reject({ error: "file not found", response: response });
                            }

                            let filesBeingDownloaded = 0,
                                checkGetNextFiles = function() {
                                    if ((filesBeingDownloaded == 0) && (response.data.nextPageToken)) {
                                        getNextFile(response.data.nextPageToken);
                                    }
                                    //Feels like there should be an if else here to address when all files are downloaded and then a resolve with that array should be returned
                                }

                            for (var i = 0; i < files.length; i++) {
                                var file = files[i];
                                if (fileLookup[file.id] !== true) {
                                    // need to download
                                    filesBeingDownloaded++;

                                    // strip off the extenstion names that will be removed automatically
                                    // as the file is decrypted/decompressed if appropriate
                                    var targetlocalPath = file.name
                                    var lastExtension = targetlocalPath.substring(targetlocalPath.lastIndexOf('.'));
                                    if (lastExtension === '.enc') {
                                        targetlocalPath = targetlocalPath.substring(0, targetlocalPath.lastIndexOf('.'));
                                    }
                                    lastExtension = targetlocalPath.substring(targetlocalPath.lastIndexOf('.'));
                                    if (lastExtension === '.gz') {
                                        targetlocalPath = targetlocalPath.substring(0, targetlocalPath.lastIndexOf('.'));
                                    }

                                    wrapperThis.downloadFile(file.id, path.join(localPath, file.id + '-' + targetlocalPath))
                                        .then(res => {
                                            let meta = res.meta,
                                                targetFile = res.targetFile;
                                            // remove paritally written file if it exists
                                            fs.unlink(targetFile, function(err, file) {
                                                if (err) {
                                                    err.errorMessage = "Error in downloadNewFiles().getMetaForFilename().downloadFile.then()";
                                                    reject(err);
                                                } else {
                                                    downloadedFiles.push(res);
                                                }
                                            });
                                        })
                                        .catch(err => {
                                            try {
                                                fs.appendFileSync(existinglocalPath, ',' + meta.id);
                                                filesBeingDownloaded--;
                                                checkGetNextFiles();
                                            } catch (err) {
                                                reject({ errorMessage: 'Failed to append to existing file list' });
                                            }
                                        });
                                }
                            }
                            checkGetNextFiles();
                        }
                    );
                }

                // ok now start by getting the first page
                getNextFile(null);
            })
            .catch(err => {
                err.errorMessage = "Error uploading file from gdriveWrapper.uploadFile()";
                reject(err);
            });
    });
}

gdriveWrapper.prototype.uploadNewFiles = function(gdrivePath, localPath, moveTo) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;
        let completedFiles = [];
        this.getMetaForFilename(gdrivePath)
            .then(parentMeta => {
                fs.readdir(localPath, function(err, files) {
                    if (err) {
                        err.localPath = localPath;
                        reject(err);
                    }

                    if (files.length === 0) {
                        // no files to upload so just end
                        reject({ error: "No files found to upload", localPath: localPath });
                    }

                    var index = 0;
                    var uploadNextFile = function(index) {
                        var localPath = path.join(localPath, files[index]);
                        var movetoName = path.join(moveTo, files[index]);
                        if (fs.statSync(localPath).isFile()) {
                            completedFiles.push({ index: index, targetlocalPath: files[index], localPath: localPath, resource: { parent: parentMeta.id, compress: false, encrypt: false } });
                            wrapperThis.uploadFile(files[index], localPath, { parent: parentMeta.id, compress: false, encrypt: false })
                                .then(meta => {
                                    fs.rename(localPath, movetoName, function(err) {
                                        if (err) {
                                            reject(err);
                                        }
                                        index++;
                                        if (index < files.length) {
                                            uploadNextFile(index);
                                        }
                                    });
                                })
                                .catch(err => {
                                    reject(err);
                                });
                        }
                    }

                    // start uploading the files
                    uploadNextFile(0);
                    resolve(completedFiles);
                });
            })
            .catch(err => {
                err.errorMessage = "Error in uploadNewFiles:getMetaForFilename()";
                reject(err);
            });
    });
}

gdriveWrapper.prototype.listFilesBypath = function(gdrivePath, complete) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;
        this.getMetaForFilename(gdrivePath)
            .then(parentMeta => {
                var fileList = new Array();
                var getNextFile = function(nextPageToken) {
                    wrapperThis.drive.files.list({
                            pageSize: 20,
                            pageToken: nextPageToken,
                            q: '\'' + parentMeta.id + '\' in parents' + ' and trashed != true' +
                                ' and mimeType != \'application/vnd.google-apps.folder\'',
                            space: 'drive'
                        })
                        .then(response => {
                            var files = response.data.files;
                            if (files.length === 0) {
                                resolve(fileList);
                            }

                            fileList = fileList.concat(files);

                            if (response.data.nextPageToken) {
                                getNextFile(response.data.nextPageToken);
                            } else {
                                resolve(fileList);
                            }
                        })
                        .catch(err => {
                            reject(err);
                        });
                }

                // ok now start by getting the first page
                getNextFile(null);
            })
            .catch(err => {
                err.errorMessage = 'Error in listFilesBypath().getMetaForFilesname().'
                reject(err);
            });
    });
}

gdriveWrapper.prototype.listFilesByFolderId = function(gdrivePath, complete) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;

        var fileList = new Array();
        var getNextFile = function(nextPageToken) {
            wrapperThis.drive.files.list({
                    pageSize: 50,
                    pageToken: nextPageToken,
                    q: '\'' + parentMeta.id + '\' in parents' + ' and trashed != true' +
                        ' and mimeType != \'application/vnd.google-apps.folder\'',
                    space: 'drive'
                })
                .then(response => {
                    var files = response.data.files;
                    if (files.length === 0) {
                        resolve(fileList);
                    }

                    fileList = fileList.concat(files);

                    if (response.data.nextPageToken) {
                        getNextFile(response.data.nextPageToken);
                    } else {
                        resolve(fileList);
                    }
                })
                .catch(err => {
                    err.errorMessage = 'Error in listFilesByFolderId().drive.files.list().'
                    reject(err);
                });
        }

        // ok now start by getting the first page
        getNextFile(null);
    });
}

module.exports = gdriveWrapper;