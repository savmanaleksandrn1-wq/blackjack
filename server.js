const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let gameState = {
    deck: [],
    dealerHand: [],
    gameStatus: 'waiting', // waiting, betting, playing, ended
    currentTurn: null,
    adminPass: 'admin'
};

function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = [];
    for (let s of suits) {
        for (let v of values) {
            deck.push({ suit: s, value: v });
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

io.on('connection', (socket) => {
    console.log('Игрок подключился:', socket.id);

    // Добавляем игрока
    players[socket.id] = {
        id: socket.id,
        name: `Игрок ${Object.keys(players).length + 1}`,
        balance: 5000,
        bet: 0,
        hand: [],
        status: 'Ожидание'
    };

    io.emit('update_players', players);

    socket.on('set_bet', (amount) => {
        if (players[socket.id] && players[socket.id].balance >= amount) {
            players[socket.id].balance -= amount;
            players[socket.id].bet += amount;
            io.emit('update_players', players);
        }
    });

    socket.on('chat_message', (data) => {
        io.emit('chat_message', { name: players[socket.id]?.name || 'Гость', text: data.text });
    });

    socket.on('admin_action', (data) => {
        if (data.pass === gameState.adminPass) {
            if (data.action === 'set_money' && players[data.targetId]) {
                players[data.targetId].balance = data.amount;
                io.emit('update_players', players);
                socket.emit('admin_response', { success: true, msg: 'Баланс обновлен!' });
            }
        } else {
            socket.emit('admin_response', { success: false, msg: 'Неверный пароль админа!' });
        }
    });

    socket.on('disconnect', () => {
        console.log('Игрок отключился:', socket.id);
        delete players[socket.id];
        io.emit('update_players', players);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});