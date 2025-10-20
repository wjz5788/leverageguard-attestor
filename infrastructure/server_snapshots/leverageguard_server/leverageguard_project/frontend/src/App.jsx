import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Box, Container, Flex, Spacer, Button } from '@chakra-ui/react'
import Header from './components/Header.jsx'
import WalletConnect from './components/WalletConnect.jsx'
import HomePage from './pages/HomePage.jsx'
import PlansPage from './pages/PlansPage.jsx'
import ClaimsPage from './pages/ClaimsPage.jsx'
import OrderHistoryPage from './pages/OrderHistoryPage.jsx'
import { Web3Provider } from './context/Web3Context.jsx'
import { UserProvider } from './context/UserContext.jsx'

function App() {
  const [isWalletConnected, setIsWalletConnected] = useState(false)

  // 检查钱包连接状态
  useEffect(() => {
    const checkWalletConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' })
          setIsWalletConnected(accounts.length > 0)
        } catch (error) {
          console.error('检查钱包连接失败:', error)
        }
      }
    }

    checkWalletConnection()
  }, [])

  return (
    <Web3Provider>
      <UserProvider>
        <Router>
          <Box minH="100vh" bg="#f8fafc">
            <Header isWalletConnected={isWalletConnected} onWalletConnect={() => setIsWalletConnected(true)} />
            
            <Container maxW="6xl" py={8}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/plans" element={<PlansPage />} />
                <Route path="/claims" element={<ClaimsPage />} />
                <Route path="/history" element={<OrderHistoryPage />} />
              </Routes>
            </Container>
            
            {!isWalletConnected && (
              <WalletConnect onConnect={() => setIsWalletConnected(true)} />
            )}
          </Box>
        </Router>
      </UserProvider>
    </Web3Provider>
  )
}

export default App