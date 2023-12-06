import { Database } from '../src/components/database/index.js'
import { Signer } from 'ethers'
import Web3 from 'web3'

export const genericAsset = {
  '@context': ['https://w3id.org/did/v1'],
  id: '',
  version: '4.1.0',
  chainId: 8996,
  nftAddress: '0x0',
  metadata: {
    created: '2021-12-20T14:35:20Z',
    updated: '2021-12-20T14:35:20Z',
    type: 'dataset',
    name: 'dataset-name',
    description: 'Ocean protocol test dataset description',
    author: 'oceanprotocol-team',
    license: 'MIT',
    tags: ['white-papers'],
    additionalInformation: { 'test-key': 'test-value' },
    links: ['http://data.ceda.ac.uk/badc/ukcp09/']
  },
  services: [
    {
      id: 'testFakeId',
      type: 'access',
      description: 'Download service',
      files: '',
      datatokenAddress: '0x0',
      serviceEndpoint: 'http://172.15.0.4:8030',
      timeout: 0
    }
  ]
}

export async function waitToIndex(did: string, database: Database): Promise<any> {
  let tries = 0
  do {
    try {
      const ddo = await database.ddo.retrieve(did)
      if (ddo) {
        return ddo
      }
    } catch (e) {
      // do nothing
    }
    sleep(1500)
    tries++
  } while (tries < 1000)
  return null
}

export async function signMessage(
  message: string,
  address: string
): Promise<{ v: string; r: string; s: string }> {
  try {
    const web3 = new Web3('http://127.0.0.1:8545')
    let signedMessage = (await web3.eth.sign(message, address)) as string
    signedMessage = signedMessage.slice(2) // remove 0x
    const r = '0x' + signedMessage.slice(0, 64)
    const s = '0x' + signedMessage.slice(64, 128)
    const v = '0x' + signedMessage.slice(128, 130)

    return { v, r, s }
  } catch (e) {
    console.log('signMessage error', e)
    throw new Error('Signing message failed')
  }
}
