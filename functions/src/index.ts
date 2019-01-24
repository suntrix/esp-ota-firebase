import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import * as md5File from 'md5-file'
import * as os from 'os'
import * as path from 'path'

admin.initializeApp()

const firestore = admin.firestore()
firestore.settings({
    timestampsInSnapshots: true
})

const storage = admin.storage()

export const update = functions.https.onRequest((request, response) => {
    console.log('request headers', request.headers)

    response.contentType('text/plain; charset=utf8')
    response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')

    if (
        request.header('user-agent') !== 'ESP8266-http-Update' ||
        request.header('x-esp8266-sta-mac') === undefined ||
        request.header('x-esp8266-ap-mac') === undefined ||
        request.header('x-esp8266-free-space') === undefined ||
        request.header('x-esp8266-sketch-size') === undefined ||
        request.header('x-esp8266-sketch-md5') === undefined ||
        request.header('x-esp8266-chip-size') === undefined ||
        request.header('x-esp8266-sdk-version') === undefined
    ) {
        return response.status(403).send('Only for ESP8266 updater!')
    }
    
    const espStaMac = request.header('x-esp8266-sta-mac')
    const currentFirmwareMD5 = request.header('x-esp8266-sketch-md5')

    // const espStaMac = '68:C6:3A:CA:7B:A2'
    // const currentFirmwareMD5 = '3e3e3093a2d79736e35812828277401c'

    return firestore.collection('devices').doc(espStaMac).get()
        .then(doc => {
            if (!doc.exists) {
                console.log('ESP MAC not configured for updates!')

                return response.status(500).send('No version for ESP MAC!')
            } else {
                console.log('device data:', doc.data())

                //TODO: need to add firmwares collection in Firestore
                const filePath = 'firmware/' + doc.data().name + '.bin'
                console.log('filePath', filePath)

                const fileName = path.basename(filePath)
                const tempFilePath = path.join(os.tmpdir(), fileName)

                return storage.bucket().file(filePath).download({
                    destination: tempFilePath,
                }).then(buffer => {
                    console.log('file downloaded locally to', tempFilePath)

                    const firmwareMD5 = md5File.sync(tempFilePath)
                    console.log('firmwareMD5', firmwareMD5)
                    console.log('currentFirmwareMD5', currentFirmwareMD5)

                    if (currentFirmwareMD5 === firmwareMD5) {
                        console.log('MD5s are the same, nothing to do here.')

                        return response.sendStatus(304)
                    } else {
                        console.log('MD5s are different, sending file', tempFilePath)

                        response.contentType('application/octet-stream').attachment(fileName).sendFile(tempFilePath)

                        return true
                    }
                }).catch(error => {
                    console.log('error', error)

                    return response.status(500).send('No version for ESP MAC!')
                })
            }
        })
        .catch(error => {
            console.log('error', error)

            return response.status(500).send('No version for ESP MAC!')
        })
})