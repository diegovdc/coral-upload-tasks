const R = require('ramda')
const Task = require('data.task')
const {slugify, writeFile, unlinkFile} = require('coral-fs-tasks')
const {writeThumbnail} = require('coral-img-tasks')

//uploadImg :: DbTask InsertOne (db_obj {} -> dbInsert) -> Path -> {originalname, mimetype, buffer} -> Task Error fsWrite+dbInsert
const uploadImg = R.curry((insertOne, {fs_path, url_path}, {mimetype, originalname, buffer}) => { 
	let 
		filename = slugify(originalname),
		url = url_path +'/'+ filename,
		thumbnail_url = url_path + '/thumbnails/' + filename,
		createdAt  = new Date(),
		db_obj = {filename, originalname, mimetype, url, thumbnail_url, createdAt, displayname: originalname },
		full_obj = R.assoc('buffer', buffer, db_obj),
		writeImage = writeFile(fs_path + '/', {filename, buffer}),
		writeThumb = writeThumbnail([200, 200], fs_path + '/thumbnails/', {filename, buffer}),
		writeImgAndThumb = R.traverse(Task.of, R.lift(x=> x), [writeImage , writeThumb])

	return R.composeK(
		R.always(Task.of(db_obj)),//if everything was succesful return the object that was saved to the database, and is associated to the file we just saved
	 	R.always(insertOne(db_obj)),
	 	R.always(writeImgAndThumb),
	 	TisImage)
	 		(full_obj)
})

// isImage :: {mimetype, *} -> Bool
const isImage = file => R.contains(R.path(['mimetype'], file), ['image/png', 'image/jpeg'])

// TisImage :: File {mimetype, *} -> Task {error, file} | File
const TisImage = file => isImage(file) ? Task.of(file) : Task.rejected({error: 'El archivo no es una imagen', file})


//multiUploadImg :: 
//	ResultsProcessor ([ImageDbInstertObj {*} &&/|| DbInsertOneError {error, *}] -> ProcessedResults)
//	-> DbTask InsertOne (ImageDbInstertObj {*} -> dbInsert)  
//	-> Path 
//	-> [{originalname, mimetype, buffer}] 
//	-> Task Error fsWrite+dbInsert+dbFind+ProcessedResults
const multiUploadImg = R.curry((processResults, insertOne, dir_path, files_arr) => 
	R.traverse(Task.of, 
		R.lift(x => x), 
		R.ap([file => uploadImg(insertOne, dir_path, file).orElse(Task.of)], files_arr)
	).map(processResults)
)



const update = R.curry((updateOne, query, update) => {
    let updatable_fields = R.omit(['_id', 'filename', 'file', 'originalname', 'mimetype', 'createdAt', 'url'], update)
    updatable_fields.updatedAt = new Date()
	return updateOne({upsert: false}, query, {$set: updatable_fields})
}) 

const remove = R.curry((deleteInOne, {img_path, thumb_path}, query) => {
	return R.composeK(
		R.always(unlinkFile(img_path)),
		R.always(unlinkFile(thumb_path)),
		deleteInOne
	)(query)
})	


// processResults :: 
// 	ErrorMessagesProcessor {ErrorCode db_insertOne(error {code} -> SplitResults {errors: [], *} -> {lang: 'error message'})} 
// 	-> SuccessMessagesProcessor (SplitResults {s: [{successful_uploads}], *} -> {s: [{successful_uploads}], success_messages: [{lang: 'message'}] ...})
// 	-> [ResultsObj {filename, originalname, mimetype, url, thumbnail_url, createdAt} || db_insertOneError {error, *}]
// 	-> { s: [{ResultsObj}], success_messages: ['message'], errors: [{db_insertOneError}], error_messages: ['message'] }
const processResults = R.curry((errorMessages, successMessages, upload_results) => 
	R.compose(
		successMessages,
		prettyErrors(errorMessages), 
		splitResults)
			(upload_results))


//splitResults :: [{error, *}, {not(error)}] -> {s: [{not(error), *}], e: [{error, *}]} 
const splitResults = R.compose(
	arr => ({s: arr[0], errors: arr[1]}), 
	R.partition(
		R.compose(R.not, R.has('error'))
	)
)

// successMessages :: ResultsObj {s: [{successful_uploads}], ...} -> {s: [{successful_uploads}], success_messages: [{lang: 'message'}] ...}
const successMessages = results_obj => 
	R.assoc('success_messages', [{//regesamos un array para mantener la homogeneidad de la interface de mensajes
			es: results_obj.s.length  === 1 ? `¡(${results_obj.s.length}) imagen fue guardada exitosamente!` : `(${results_obj.s.length}) imágenes fueron guardados exitosamente!`,
			en: results_obj.s.length  === 1 ?  `(${results_obj.s.length}) image was uploaded successfully!` : `(${results_obj.s.length}) images where uploaded successfully!`
		}])(results_obj)


// prettyErrors :: 
// 	ErrorMessages {db_insertOne (MongoError -> MongoDoc {*} -> {lang: 'message'})}
// 	-> ResultsObj
// 	-> {lang: 'message'}
const prettyErrors = R.curry((errorMessages, results_obj) => {
	let messages = R.map(err => errorMessages[err.code](err), results_obj.errors)
	return R.assoc('error_messages', messages, results_obj)
})

const errorMessages = {
	db_insertOne({error, doc}) {
		if (error.code === 11000) {
			return {
				es: `El archivo "${doc.originalname}" ya existe.`,
				en: `The file "${doc.originalname}" already exists.`
			}
		} else {
			return {
				es: 'Hubo un error al tratar de guardar el archivo.',
				en: 'There was an error while trying to save the file'
			}
		}
	}
}

module.exports = {
	uploadImg,
	isImage,
	multiUploadImg,
	update,
	remove,
	processResults,
	splitResults,
	successMessages,
	prettyErrors,
	errorMessages
}