// Add all the supported commands

export const PROTOCOL_COMMANDS = {
  DOWNLOAD_URL: 'downloadURL',
  ECHO: 'echo',
  GET_DDO: 'getDDO',
  QUERY: 'query',
  NONCE: 'nonce'
}

export interface Command {
  command: string
  node?: string // if not present it means current node
}

export interface DownloadCommand extends Command {
  url: string
  aes_encrypted_key?: string // if not present it means download without encryption
}

export interface GetDdoCommand extends Command {
  id: string
}

export interface QueryCommand extends Command {
  query: Record<string, any>
}

export interface NonceCommand extends Command {
  address: string // consumer address
}

export const SUPPORTED_PROTOCOL_COMMANDS: string[] = [
  PROTOCOL_COMMANDS.DOWNLOAD_URL,
  PROTOCOL_COMMANDS.ECHO,
  PROTOCOL_COMMANDS.GET_DDO,
  PROTOCOL_COMMANDS.QUERY,
  PROTOCOL_COMMANDS.NONCE
]
