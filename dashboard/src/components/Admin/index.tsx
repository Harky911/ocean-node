import React from 'react'
import styles from './index.module.css'
import DownloadLogs from '../Admin/DownloadLogs'
import StopNode from '../Admin/StopNode'
import { useAdminContext } from '@/context/AdminProvider'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'

export default function AdminActions() {
  const { generateSignature, signature, validTimestamp, admin } = useAdminContext()
  const { isConnected } = useAccount()

  return (
    <div className={styles.root}>
      <div className={styles.title}>ADMIN ACTIONS</div>
      {!isConnected && <ConnectButton />}
      {isConnected && !admin && (
        <div className={styles.connecting}>Your account does not have admin access</div>
      )}

      {(!signature || !validTimestamp) && admin && (
        <button type="button" className={styles.unlockButton} onClick={generateSignature}>
          Unlock
        </button>
      )}
      {signature && validTimestamp && admin && (
        <>
          <DownloadLogs />
          <StopNode />
        </>
      )}
    </div>
  )
}
