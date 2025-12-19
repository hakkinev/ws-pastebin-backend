const http = require('http') // http för render
const WebSocket = require('ws') // bibban
const jwt = require('jsonwebtoken')
require('dotenv').config()

const PORT = process.env.PORT || 8081
const JWT_SECRET = process.env.JWT_SECRET


// mappen för alla kopplingar
const clientsByUser = new Map()

const server = http.createServer((req, res) => {
    res.writeHead(200)
    res.end("WebSocket Pastebin backend running")
})

// skapa websocket server

const wss = new WebSocket.Server({ server })

// när klienten kopplar sig

wss.on('connection', (ws, req) => {
    try {
        // JWT skickas som query
        const url = new URL(req.url, `http://${req.headers.host}`)
        const token = url.searchParams.get('token')

        // stäng kopplingen utan token
        if (!token) {
            ws.close(4001, "No token provided")
            return
        }

        // om token expired, (4003) så klienten kan refresh + reconnect
        let payload
        try {
            payload = jwt.verify(token, JWT_SECRET)// verifiera jwt en gång
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                ws.close(4003, "Token expired") // del3
                return
            }
            throw err // andra fel
        }

        const userId = payload.sub

        console.log("User connected:", userId)

        // spara userID på ws objektet
        ws.userId = userId

        // lägg till klienten i mappen
        if (!clientsByUser.has(userId)) {
            clientsByUser.set(userId, new Set())
        }

        clientsByUser.get(userId).add(ws)

        // skicka status till klienten
        ws.send(JSON.stringify({
            type: "status",
            msg: "connected"
        }))

        // när klienten skickar text
        ws.on('message', (data) => {
            const text = data.toString()
            console.log(`Message from user ${userId}:`, text)

            // hämtar alla connections för användaren
            const userClients = clientsByUser.get(userId)
            if (!userClients) return

            // skicka texten till alla användarens connections
            for (const client of userClients) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: "text",
                        text: text
                    }))
                }
            }
        })

        // när klienten disconnectar
        ws.on('close', () => {
            console.log("User disconnected:", userId)

            const userClients = clientsByUser.get(userId)
            if (!userClients) return

            userClients.delete(ws)

            // putsar om inga connections
            if (userClients.size === 0) {
                clientsByUser.delete(userId)
            }
        })

    } catch (err) {
        console.log("JWT error:", err.message)
        ws.close(4002, "Invalid token")
    }
})

// starta servern
server.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`)
})
