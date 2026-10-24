const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let dealer = { hand: [], score: 0 };
let deck = [];
let gameStatus = 'betting'; // betting, playing, finished

function createDeck() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let d = [];
    for (let s of suits) {
        for (let v of values) {
            d.push({ suit: s, value: v });
        }
    }
    return d.sort(() => Math.random() - 0.5);
}

function calculateScore(hand) {
    let score = 0;
    let aces = 0;
    for (let card of hand) {
        if (['J', 'Q', 'K'].includes(card.value)) {
            score += 10;
        } else if (card.value === 'A') {
            aces += 1;
            score += 11;
        } else {
            score += parseInt(card.value);
        }
    }
    while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
    }
    return score;
}

io.on('connection', (socket) => {
    players[socket.id] = {
        name: `Игрок ${Object.keys(players).length + 1}`,
        balance: 1000,
        bet: 0,
        hand: [],
        score: 0,
        status: 'betting'
    };

    io.emit('update_game', { players, dealer, gameStatus });

    socket.on('set_bet', (amount) => {
        let p = players[socket.id];
        if (p && p.balance >= amount && gameStatus === 'betting') {
            p.balance -= amount;
            p.bet += amount;
            io.emit('update_game', { players, dealer, gameStatus });
        }
    });

    socket.on('start_game', () => {
        deck = createDeck();
        dealer.hand = [deck.pop(), deck.pop()];
        dealer.score = calculateScore(dealer.hand);

        for (let id in players) {
            let p = players[id];
            if (p.bet > 0) {
                p.hand = [deck.pop(), deck.pop()];
                p.score = calculateScore(p.hand);
                p.status = 'playing';
            } else {
                p.status = 'watching';
            }
        }
        gameStatus = 'playing';
        io.emit('update_game', { players, dealer, gameStatus });
    });

    socket.on('hit', () => {
        let p = players[socket.id];
        if (p && p.status === 'playing') {
            p.hand.push(deck.pop());
            p.score = calculateScore(p.hand);
            if (p.score > 21) {
                p.status = 'bust';
            }
            io.emit('update_game', { players, dealer, gameStatus });
        }
    });

    socket.on('stand', () => {
        let p = players[socket.id];
        if (p && p.status === 'playing') {
            p.status = 'stand';
            
            let allDone = Object.values(players).every(pl => pl.status !== 'playing');
            if (allDone) {
                while (dealer.score < 17) {
                    dealer.hand.push(deck.pop());
                    dealer.score = calculateScore(dealer.hand);
                }
                for (let id in players) {
                    let pl = players[id];
                    if (pl.bet > 0) {
                        if (pl.status === 'bust') {
                            pl.status = 'lose';
                        } else if (dealer.score > 21 || pl.score > dealer.score) {
                            pl.status = 'win';
                            pl.balance += pl.bet * 2;
                        } else if (pl.score === dealer.score) {
                            pl.status = 'push';
                            pl.balance += pl.bet;
                        } else {
                            pl.status = 'lose';
                        }
                        pl.bet = 0;
                    }
                }
                gameStatus = 'finished';
            }
            io.emit('update_game', { players, dealer, gameStatus });
        }
    });

    socket.on('reset_round', () => {
        gameStatus = 'betting';
        for (let id in players) {
            players[id].hand = [];
            players[id].score = 0;
            players[id].bet = 0;
            players[id].status = 'betting';
        }
        dealer.hand = [];
        dealer.score = 0;
        io.emit('update_game', { players, dealer, gameStatus });
    });

    socket.on('chat_message', (data) => {
        io.emit('chat_message', { name: players[socket.id].name, text: data.text });
    });

    socket.on('admin_action', (data) => {
        if (data.pass === 'admin') {
            if (data.action === 'set_money' && players[data.targetId]) {
                players[data.targetId].balance = data.amount;
                io.emit('update_game', { players, dealer, gameStatus });
                socket.emit('admin_response', { success: true, msg: 'Баланс обновлен!' });
            }
        } else {
            socket.emit('admin_response', { success: false, msg: 'Неверный пароль!' });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('update_game', { players, dealer, gameStatus });
    });
});

server.listen(10000, () => {
    console.log('Сервер запущен');
});
