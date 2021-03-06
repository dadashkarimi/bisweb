'use strict';

const AWS = require('aws-sdk');
const AWSCognitoIdentity = require('amazon-cognito-identity-js');
const AWSParameters = require('../../web/aws/awsparameters.js');
const bis_webutil = require('bis_webutil.js');
const bisweb_filedialog = require('bisweb_filedialog.js');


/**
 * Class designed to save and load files from Amazon S3, using Amazon Cognito for authentication. 
 * Does not require the use of an app key like Dropbox and Google Drive. 
 */
class AWSModule {

    constructor() {
        AWS.config.update({
            'region' : AWSParameters.RegionName,
            'credentials' : new AWS.CognitoIdentityCredentials({
                'IdentityPoolId' : AWSParameters.IdentityPoolId
            })
        });

        const userPoolData = {
            'UserPoolId' : AWSParameters.authParams.UserPoolId,
            'ClientId' : AWSParameters.authParams.ClientId
        };

        this.userPool = new AWSCognitoIdentity.CognitoUserPool(userPoolData);

        this.s3 = this.createS3(AWSParameters.BucketName);

        this.saveImageModal = null;

        //UI features
        this.createUserModal = null;
        this.authUserModal = null;

        //file display modal gets deleted if you try to load it too soon
        //not completely sure why -Zach
        bis_webutil.runAfterAllLoaded( () => {   
            this.fileDisplayModal = new bisweb_filedialog('Bucket Contents', { 'makeFavoriteButton' : false });
            this.fileSaveModal = new bisweb_filedialog('Choose Folder to Save In', { 'makeFavoriteButton' : false, 'modalType' : 'save', 'displayFiles' : false });           
        });

    }

    /**
     * Creates an instance of the S3 API that points to a given bucket with a given set of credentials. 
     * @param {String} bucketName - The name of the bucket
     * @param {AWS.Credentials} credentials - Amazon provided credentials to sign S3 requests with. Retrived through awsAuthUser
     * @param {AWS.Credentials} session_token - Amazon provided session_token to sign S3 requests with. Retrieved through awsAuthUser
     */
    createS3(bucketName, credentials = null, session_token = null) {
        let s3 = new AWS.S3({
            'apiVersion' : '2006-03-01',
            'credentials' : credentials,
            'sessionToken' : session_token,
            'params' : { Bucket : bucketName}
        });

        return s3;
    }

    /**
     * Lists the objects in the bucket referred to by the current S3 instance (this.S3). Note that S3 is a flat storage structure in which everything is stored in the same place.
     * Creates a file browsing dialog using bisweb_filedialog (see the documentation in that file for more details).
     * 
     */
    listObjectsInBucket(filters, modalTitle) {
        this.s3.listObjectsV2( {}, (err, data) => {
            if (err) { console.log('an error occured', err); return; }
            console.log('got objects', data);

            let formattedFiles = this.formatRawS3Files(data.Contents, filters);

            this.fileDisplayModal.createFileList(formattedFiles);
            this.fileDisplayModal.showDialog(filters, modalTitle);
        });
    }

    /**
     * Downloads a file with a given name from the current S3 bucket. 
     * Called by bis_genericio starting from when a user sends the request by clicking on a file in a file display modal.
     * 
     * @param {String} filename - The name of the file 
     */
    downloadFile(filename) {

        return new Promise( (resolve, reject) => {
            let getParams = { 
                'Key' : filename,
                'Bucket' : AWSParameters.BucketName
            };

            this.s3.getObject(getParams, (err, data) => {
                if (err) { 
                    reject(err); 
                    return;
                }

                console.log('data', data.Body);

                resolve({ 
                    data: data.Body, 
                    filename: filename 
                });
            });
        });
    }

    /**
     * Uploads a file to the current S3 bucket. 
     * Called by bis_genericio starting from when a user types a filename into the save filename modal and clicks confirm. 
     * 
     * @param {String} filename - The name of the file 
     * 
     */
    uploadFile(filename, data) {

        return new Promise( (resolve, reject) => {
            let uploadParams = {
                'Key' : filename,
                'Bucket' : AWSParameters.BucketName,
                'Body' : data
            };

            this.s3.upload(uploadParams, (err) => {
                if (err) { 
                    bis_webutil.createAlert('Failed to upload ' + filename + ' to S3 bucket', true, 0, 3000);
                    console.log('S3 error', err);
                    reject(err); 
                } else {
                    bis_webutil.createAlert('Uploaded ' + filename + ' to S3 bucket successfully', false, 0, 3000); 
                    resolve('Upload successful');
                }
            });
        });
    }

    /**
     * Creates the file list to allow a user to choose where to save an image on one of the viewers  
     */
    createSaveImageModal(filters, modalTitle) {
        this.s3.listObjectsV2( {}, (err, data) => {
            if (err) { console.log('an error occured', err); return; }
            console.log('got objects', data);

            let formattedFiles = this.formatRawS3Files(data.Contents);

            console.log('files', formattedFiles);
            this.fileSaveModal.createFileList(formattedFiles);
            this.fileSaveModal.showDialog(filters, modalTitle);
        });
    }

    /**
     * Attempts to authenticate the current user before executing a given S3 command (one of either 'showfiles' or 'uploadfiles' as of 7-23-18, which respectively call listObjectsInBucket and createImageSaveDialog).
     * If the user is not authenticated, a popup will appear that will prompt the user to enter their AWS credentials, or if the credentials are already cached, it will begin the authentication process. It will execute the command once the user has been successfully authenticated.
     * If the user is authenticated, wrapInAuth will call the appropriate command. 
     * 
     * @param {String} command - A string indicating the command to execute. 
     * @param {Object} opts - An options object
     * @param {Function} opts.callback - A callback function propagated from bis_webfileutil that will handle the non-AWS I/O for the retrieved data, , and a list of acceptable file suffixes.
     * @param {String} opts.title - The title to display on the load/save modal
     * @param {Object} opts.AWSParameters - AWS parameters related to the bucket the user is trying to log in to.
     */
    wrapInAuth(command, opts) {
        console.log('opts', opts);
        let parseCommand = () => {
            //this.callback = opts.callback;
            switch(command) {
                case 'showfiles' : {
                    this.fileDisplayModal.fileRequestFn = opts.callback;
                    this.listObjectsInBucket(opts.suffix, opts.title); 
                    break;
                }
                case 'uploadfile' : {
                    this.fileSaveModal.fileRequestFn = opts.callback;
                    this.createSaveImageModal(opts.suffix, opts.title); 
                    break;
                }
                default : console.log('Unrecognized aws command', command, 'cannot complete request.');
            }
        };
        let expireTime = AWS.config.credentials.expireTime ? Date.parse(AWS.config.credentials.expireTime) : -1;

        if (expireTime < Date.now()) {
            this.awsAuthUser(parseCommand, opts.AWSParameters);
            return;
        } else {
            parseCommand();
        }

       
    }

    /**
     * Begins the AWS authentication process by opening a new winbow with the URL specified as 'biswebaws.html'. This performs the following steps:
     * 1.) Attempts to log in to the Amazon Cognito User Pool associated with BisWeb, which will prompt the user for their Amazon Cognito credentials. The user may create an account at this time.
     * 2.) Attempts to register the user with an Amazon Cognito Identity pool authorized to access the relevant bucket. If successful, the user will be returned a set of credentials that expire in a short period of tiem (about an hour).
     * 
     * @param {Function} cb - Function to call after successful authentication
     */ 
    awsAuthUser(cb) {
        let returnf="./biswebaws.html";
        if (typeof window.BIS !=='undefined') {
            returnf="../build/web/biswebaws.html";
        }

        let authWindow = window.open(returnf, '_blank', 'width=400, height=400');
        let idTokenEvent = (data) => {
            //console.log('storage event', data);
            if (data.key === 'aws_id_token') {
                window.removeEventListener('storage', idTokenEvent);

                //---------------------------------------------------------------
                // 2.) log into identity pool
                //---------------------------------------------------------------

                let login = {}, cognitoUserPoolKey = `cognito-idp.${AWSParameters.RegionName}.amazonaws.com/${AWSParameters.authParams.UserPoolId}`;

                //construct credentials request from id token fetched from user pool, and the id of the identity pool
                //https://docs.aws.amazon.com/cognitoidentity/latest/APIReference/API_GetId.html#API_GetId_ResponseSyntax
                login[cognitoUserPoolKey] = data.newValue;
                AWS.config.credentials = new AWS.CognitoIdentityCredentials({
                    'IdentityPoolId': AWSParameters.IdentityPoolId,
                    'Logins': login,
                    'RoleSessionName': 'web'
                });

                AWS.config.credentials.get( (err) => {
                    if (err) {
                        console.log(err);
                        authWindow.postMessage({ 'failure': 'auth failed' });
                    } else {
                        console.log('Exchanged access token for access key');
                        authWindow.postMessage({ 'success': 'auth complete' }, window.location);

                        //TODO: determine whether refresh is necessary
                        AWS.config.credentials.refresh( (err) => {
                            if (err) { console.log('an error occured refreshing', err); }
                            else { 
                                console.log('refresh successful.'); 
                                this.s3 = this.createS3(AWSParameters.BucketName, AWS.config.credentials);
                                authWindow.close();
                                cb();
                            }
                        });
                    }
                });
            }
        };

        window.addEventListener('storage', idTokenEvent);
    }

    /**
     * Takes the raw data returned by S3.listObjectsV2 and turns it into a nested file tree that bisweb_filedialog can render.
     *
     * @param {Object} files - The 'Contents' field of the data returned by S3.listObjects.
     * @param {String} filters - A comma separated string of acceptable file types -- files with an extension not in filters are excluded. 
     * @returns An array of files parseable by bisweb_filedialog
     */
    formatRawS3Files(files, filters = null) {

        let filtersArray = filters ? filters.split(',') : null;

        //filters start with a '.' which we strip out here for compatibility with String.split()
        if (filters) {
            for (let i = 0; i < filtersArray.length; i++) {
                filtersArray[i] = filtersArray[i].substring(1);
            }
        }

        //split filenames and strip out all the folders (filepaths that end with '/')
        let paths = [];
        for (let file of files) {

            let splitFile = file.Key.split('/');

            //folders have an empty string after the last '/'
            if (splitFile[splitFile.length - 1] !== '') {
                let fileExtension = splitFile[splitFile.length - 1].split('.');

                if (filters) {
                    for (let filter of filtersArray) {
                        if (fileExtension[fileExtension.length - 1] === filter) {
                            paths.push(splitFile);
                        }
                    }
                } else {
                    paths.push(splitFile);
                }

            }
        }

        //sort files by hierarchical order (root folders first, then folders one level deep, and so on)
        paths.sort( (a,b) => { 
            return (a.length - b.length);
        });

        let formattedFiles = [];

        for (let path of paths) {
            let currentLocation = formattedFiles;

            for (let folder of path) {
                let enclosingFolder = findFileWithKey(folder, currentLocation);
                if (!enclosingFolder) {

                    //files should end in a filetype, i.e. a '.' and some extension
                    //otherwise it's a folder
                    if(folder.split('.').length === 1) {

                        let folderPath = makeFolderPath(path, folder);
                        let newEntry = { 
                            'text' : folder,
                            'path' : folderPath,
                            'type' : 'directory',
                            'children' : []
                        };

                        currentLocation.push(newEntry);

                        //we created the new file in the process of determining where to add the new file, so set the new folder to be the enclosing folder for files farther down the path
                        enclosingFolder = newEntry;
                    } else {

                        let folderPath = path.join('/');
                        let fileType = folder.split('.');

                        let newEntry = {
                            'text' : folder,
                            'path' : folderPath
                        };

                        switch(fileType[fileType.length - 1]){
                            case 'gz' : newEntry.type = (fileType[fileType.length - 2] === 'nii') ? 'picture' : 'file'; break;
                            case 'md' : newEntry.type = 'text'; break;
                            case 'mkv' : 
                            case 'avi' : 
                            case 'mp4' : newEntry.type = 'video'; break;
                            case 'mp3' :
                            case 'flac' :
                            case 'FLAC' :
                            case 'wav' : 
                            case 'WAV' : newEntry.type = 'audio'; break;
                            default : newEntry.type = 'file';
                        }


                        currentLocation.push(newEntry);
                    }
                } 
                
                currentLocation = enclosingFolder.children;
            }
        }
        return formattedFiles;

        //helper function to find whether a folder or a file with the given name already exists in currentDirectory
        function findFileWithKey(key, currentDirectory) {
            for (let file of currentDirectory) {
                if (file.text === key) {
                    return file;
                }
            }

            return false;
        }

        function makeFolderPath(fullPath, folderName) {
            let newPath = '';

            for (let i = 0; i < fullPath.length; i++) {
                if (fullPath[i] === folderName) {
                    return newPath.concat(folderName);
                }

                newPath = newPath.concat(fullPath[i]);
            }

            return -1;
        }
    }
}

module.exports = AWSModule;
