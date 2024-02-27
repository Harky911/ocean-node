import express from 'express'
import { getNonce } from '../core/utils/nonceHandler.js'
import { streamToString } from '../../utils/util.js'
import { Readable } from 'stream'
import { calculateFee } from '../core/utils/feesHandler.js'
import { DDO } from '../../@types/DDO/DDO'
import { LOG_LEVELS_STR } from '../../utils/logging/Logger.js'
import { PROTOCOL_COMMANDS } from '../../utils/constants.js'
import { EncryptFileHandler, EncryptHandler } from '../core/encryptHandler.js'
import { HTTP_LOGGER } from '../../utils/logging/common.js'
import { DecryptDdoHandler } from '../core/ddoHandler.js'
import { DownloadHandler } from '../core/downloadHandler.js'
import { DownloadCommand } from '../../@types/commands.js'
import { BaseFileObject, EncryptMethod } from '../../@types/fileObject.js'
import { getConfiguration } from '../../utils/index.js'
import { P2PCommandResponse } from '../../@types/OceanNode.js'
import { getEncryptMethodFromString } from '../../utils/crypt.js'

export const providerRoutes = express.Router()

export const SERVICES_API_BASE_PATH = '/api/services'

providerRoutes.post(`${SERVICES_API_BASE_PATH}/decrypt`, async (req, res) => {
  try {
    const result = await new DecryptDdoHandler(req.oceanNode).handle({
      ...req.body,
      command: PROTOCOL_COMMANDS.DECRYPT_DDO
    })
    if (result.stream) {
      const decryptedData = await streamToString(result.stream as Readable)
      res.header('Content-Type', 'text/plain')
      res.status(200).send(decryptedData)
    } else {
      res.status(result.status.httpStatus).send(result.status.error)
    }
  } catch (error) {
    HTTP_LOGGER.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`)
    res.status(500).send(`Internal Server error: ${error.message}`)
  }
})

providerRoutes.post(`${SERVICES_API_BASE_PATH}/encrypt`, async (req, res) => {
  try {
    const data = req.body.toString()
    if (!data) {
      res.status(400).send('Missing required body')
      return
    }
    const result = await new EncryptHandler(req.oceanNode).handle({
      blob: data,
      encoding: 'string',
      encryptionType: EncryptMethod.ECIES,
      command: PROTOCOL_COMMANDS.ENCRYPT
    })
    if (result.stream) {
      const encryptedData = await streamToString(result.stream as Readable)
      res.header('Content-Type', 'application/octet-stream')
      res.status(200).send(encryptedData)
    } else {
      res.status(result.status.httpStatus).send(result.status.error)
    }
  } catch (error) {
    HTTP_LOGGER.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`)
    res.status(500).send('Internal Server Error')
  }
})

// There are two ways of encrypting a file:

// 1) Body contains file object
// Content-type header must be set to application/json

// 2 ) Body contains raw file content
// Content-type header must be set to application/octet-stream or multipart/form-data

// Query.encryptMethod can be aes or ecies (if missing, defaults to aes)

// Returns:
// Body: encrypted file content
// Headers
// X-Encrypted-By: our_node_id
// X-Encrypted-Method: aes or ecies
providerRoutes.post(`${SERVICES_API_BASE_PATH}/encryptFile`, async (req, res) => {
  const writeResponse = async (
    result: P2PCommandResponse,
    encryptMethod: EncryptMethod
  ) => {
    if (result.stream) {
      const nodeId = (await getConfiguration()).keys.peerId.toString()
      const encryptedData = await streamToString(result.stream as Readable)
      res.set({
        'Content-Type': 'application/octet-stream',
        'X-Encrypted-By': nodeId,
        'X-Encrypted-Method': encryptMethod
      })
      res.status(200).send(encryptedData)
    } else {
      res.status(result.status.httpStatus).send(result.status.error)
    }
  }

  const getEncryptedData = async (
    encryptMethod: EncryptMethod.AES | EncryptMethod.ECIES,
    input: Buffer
  ) => {
    const result = await new EncryptFileHandler(req.oceanNode).handle({
      rawData: input,
      encryptionType: encryptMethod,
      command: PROTOCOL_COMMANDS.ENCRYPT_FILE
    })
    return result
  }

  try {
    const encryptMethod: EncryptMethod = getEncryptMethodFromString(
      req.query.encryptMethod as string
    )
    let result: P2PCommandResponse
    if (req.is('application/json')) {
      // body as fileObject
      result = await new EncryptFileHandler(req.oceanNode).handle({
        files: req.body as BaseFileObject,
        encryptionType: encryptMethod,
        command: PROTOCOL_COMMANDS.ENCRYPT_FILE
      })
      return await writeResponse(result, encryptMethod)
      // raw data on body
    } else if (req.is('application/octet-stream') || req.is('multipart/form-data')) {
      if (req.is('application/octet-stream')) {
        result = await getEncryptedData(encryptMethod, req.body)
        return await writeResponse(result, encryptMethod)
      } else {
        // multipart/form-data
        const data: Buffer[] = []
        req.on('data', function (chunk) {
          data.push(chunk)
        })
        req.on('end', async function () {
          result = await getEncryptedData(encryptMethod, Buffer.concat(data))
          return await writeResponse(result, encryptMethod)
        })
      }
    } else {
      res.status(400).send('Invalid request (missing body data or invalid content-type)')
    }
  } catch (error) {
    HTTP_LOGGER.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`)
    res.status(500).send('Internal Server Error')
  }
})

providerRoutes.get(`${SERVICES_API_BASE_PATH}/initialize`, async (req, res) => {
  try {
    const did = String(req.query.documentId)
    const consumerAddress = String(req.query.consumerAddress)
    const serviceId = String(req.query.serviceId)

    const DB = req.oceanNode.getDatabase()
    const ddo = (await DB.ddo.retrieve(did)) as DDO

    if (!ddo) {
      res.status(400).send('Cannot resolve DID')
      return
    }

    const service = ddo.services.find((service) => service.id === serviceId)
    if (!service) {
      res.status(400).send('Invalid serviceId')
      return
    }
    if (service.type === 'compute') {
      res
        .status(400)
        .send('Use the initializeCompute endpoint to initialize compute jobs')
      return
    }

    const datatoken = service.datatokenAddress
    const nonceResult = await getNonce(DB.nonce, consumerAddress)
    const nonce = nonceResult.stream
      ? await streamToString(nonceResult.stream as Readable)
      : nonceResult.stream
    const providerFee = await calculateFee(ddo, serviceId)
    const response = {
      datatoken,
      nonce,
      providerFee
    }

    res.json(response)
  } catch (error) {
    HTTP_LOGGER.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`)
    res.status(500).send('Internal Server Error')
  }
})

providerRoutes.get(`${SERVICES_API_BASE_PATH}/nonce`, async (req, res) => {
  try {
    const userAddress = String(req.query.userAddress)
    if (!userAddress) {
      res.status(400).send('Missing required parameter: "userAddress"')
      return
    }
    const nonceDB = req.oceanNode.getDatabase().nonce
    const result = await getNonce(nonceDB, userAddress)
    if (result.stream) {
      res.json({ nonce: await streamToString(result.stream as Readable) })
    } else {
      res.status(400).send()
    }
  } catch (error) {
    HTTP_LOGGER.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`)
    res.status(500).send('Internal Server Error')
  }
})

providerRoutes.get(
  `${SERVICES_API_BASE_PATH}/download`,
  express.urlencoded({ extended: true, type: '*/*' }),
  async (req, res): Promise<void> => {
    if (!req.query) {
      res.sendStatus(400)
      return
    }
    HTTP_LOGGER.logMessage(
      `Download request received: ${JSON.stringify(req.query)}`,
      true
    )
    try {
      const {
        fileIndex,
        documentId,
        serviceId,
        transferTxId,
        nonce,
        consumerAddress,
        signature
      } = req.query

      const downloadTask: DownloadCommand = {
        fileIndex: Number(fileIndex),
        documentId: documentId as string,
        serviceId: serviceId as string,
        transferTxId: transferTxId as string,
        nonce: nonce as string,
        consumerAddress: consumerAddress as string,
        signature: signature as string,
        command: PROTOCOL_COMMANDS.DOWNLOAD
      }

      const response = await new DownloadHandler(req.oceanNode).handle(downloadTask)
      if (response.stream) {
        res.status(response.status.httpStatus)
        res.set(response.status.headers)
        response.stream.pipe(res)
      } else {
        res.status(response.status.httpStatus).send(response.status.error)
      }
    } catch (error) {
      HTTP_LOGGER.logMessage(`Error: ${error}`, true)
      res.status(500).send(error)
    }
    // res.sendStatus(200)
  }
)
