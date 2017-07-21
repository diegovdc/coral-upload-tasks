## Sample Usage

### Your Model
```
// Model/Uploads.js
const app = require('../app').app
const dbTasks = app.locals.dbTasks

// insertOne :: DbTask InsertOne (db_obj {} -> dbInsert)
//An insertion operation for any kind of database can be used as long as it is a Task (fantasy land spec e.g. folktal/data.task) that takes an object with this fields {filename, originalname, mimetype, url, thumbnail_url, createdAt, displayname} and returns a database insertion
const insertOne = dbTasks.insertOne('UploadsDocument') 

const {	
	uploadImg,
	multiUploadImg,
	processResults,
	successMessages,
	errorMessages
} = require('../mongo-upload-tasks')


module.exports = {
	find,
	uploadImg: uploadImg(insertOne),
	multiUploadImg: multiUploadImg(processResults(errorMessages, successMessages), insertOne),
}
```

### Your Controller
```
//Controller/Uploads.js
//an express.js controller
module.exports.post = (req, res) => {
	Uploads.multiUploadImg({fs_path: '/my/uploads/folder', url_path: 'http:my/uploads/folder'}, req.files).fork(
		error => console.log(error),
		({s, success_messages, error_messages}) => res.status(200).json({s, success_messages, error_messages, success: true})
	)
}
```

## To do
Add Tests (at the moment this file is tested by the FileUploads.spec.js sample test in Coral Framework)
Remove calls to Date() to make the Tasks completely pure?
