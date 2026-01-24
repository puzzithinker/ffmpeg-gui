import React, { useEffect, useState } from 'react'
import { logger } from '../lib/logger'

const LogFileInfo: React.FC = () => {
  const [logPath, setLogPath] = useState<string>('')

  useEffect(() => {
    const getPath = async () => {
      try {
        const path = await logger.getLogFilePath()
        setLogPath(path)
      } catch (error) {
        console.error('Failed to get log file path:', error)
      }
    }
    getPath()
  }, [])

  if (!logPath) return null

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
      <p className="text-blue-800">
        <strong>Log file location:</strong> <code className="bg-blue-100 px-2 py-1 rounded">{logPath}</code>
      </p>
      <p className="text-blue-600 text-xs mt-1">
        Check this file for detailed error information
      </p>
    </div>
  )
}

export default LogFileInfo
