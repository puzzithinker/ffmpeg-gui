import { invoke } from '@tauri-apps/api/core'

export const logger = {
  log: async (message: string) => {
    try {
      await invoke('write_frontend_log', { message })
    } catch (error) {
      // Fallback to console if logging fails
      console.error('Failed to write log:', error)
      console.log(message)
    }
  },

  error: async (message: string, error?: any) => {
    const errorMessage = error instanceof Error
      ? `${message}: ${error.message}`
      : `${message}: ${JSON.stringify(error)}`

    try {
      await invoke('write_frontend_log', { message: `ERROR - ${errorMessage}` })
    } catch (e) {
      console.error('Failed to write error log:', e)
      console.error(errorMessage)
    }
  },

  getLogFilePath: async (): Promise<string> => {
    try {
      return await invoke('get_log_file_path')
    } catch (error) {
      throw new Error(`Failed to get log file path: ${error}`)
    }
  }
}
