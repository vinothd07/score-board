const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const port = 3000;

const server = http.createServer(app);
const io = socketIo(server);


// websocket code
io.on('connection', (socket) => {
    console.log('A user connected');

    // Example: Broadcast a message to all connected clients
    socket.on('chat message', (msg) => {
        io.emit('chat message', msg);
    });

    // Disconnect handling
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/mydatabase', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Define mongoose models
const Tournament = mongoose.model('Tournament', { name: String, date: Date });
const Team = mongoose.model('Team', { name: String, address: String });
const Player = mongoose.model('Player', {
    name: String,
    age: Number,
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    mobile: String,
    image: String,
    scores: [
        {
            match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
            score: Number,
        }
    ],
});
const Match = mongoose.model('Match', {
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament' },
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
    date: Date,
    scores: [{
        team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
        score: Number,
        overs: Number,
        runRate: Number,
    }],
    matchStatus: { type: String, enum: ['upcoming', 'started', 'completed'] },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
});

const Score = mongoose.model('Score', {
    match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    score: Number,
    overs: Number,
    wickets: [
        {
            type: { type: String, enum: ['bowled', 'caught', 'lbw', 'run out', 'stumped', 'hit wicket', 'retired hurt', 'obstructing the field'] },
            player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
        }
    ],
});

// utils
function calculateRunRate(score) {
    if (score.overs && score.overs > 0) {
        return score.score / score.overs;
    }
    return 0;
}
function determineMatchStatus(matchDate) {
    const currentDate = new Date();
    if (currentDate < matchDate) {
        return 'upcoming';
    } else if (currentDate > matchDate) {
        return 'completed';
    } else {
        return 'started';
    }
}
function determineWinner(scores) {
    // Implement your logic to determine the winner based on scores
    // For example, compare total scores, run rates, etc.
    // This is a simplified example, adjust it based on your requirements.

    const team1Score = scores.find(score => score.team.toString() === matchDetails.teams[0]._id.toString());
    const team2Score = scores.find(score => score.team.toString() === matchDetails.teams[1]._id.toString());

    if (team1Score.score > team2Score.score) {
        return matchDetails.teams[0]._id;
    } else if (team2Score.score > team1Score.score) {
        return matchDetails.teams[1]._id;
    } else {
        // It's a tie, you may handle ties differently based on your requirements
        return null;
    }
}

// Express middleware to parse JSON
app.use(express.json());

// Define routes
app.get('/tournaments', async (req, res) => {
    try {
        const tournaments = await Tournament.find();
        res.json(tournaments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/tournaments', async (req, res) => {
    try {
        const newTournament = new Tournament(req.body);
        const savedTournament = await newTournament.save();
        res.status(201).json(savedTournament);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/teams', async (req, res) => {
    try {
        const teams = await Team.find();
        res.json(teams);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/teams', async (req, res) => {
    try {
        const newTeam = new Team(req.body);
        const savedTeam = await newTeam.save();
        res.status(201).json(savedTeam);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/players', async (req, res) => {
    try {
        const players = await Player.find();
        res.json(players);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/players', async (req, res) => {
    try {
        const newPlayer = new Player(req.body);
        const savedPlayer = await newPlayer.save();
        res.status(201).json(savedPlayer);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/matches', async (req, res) => {
    try {
        const matches = await Match.find().populate('tournament teams');
        res.json(matches);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/matches', async (req, res) => {
    try {
        const newMatch = new Match(req.body);
        const savedMatch = await newMatch.save();
        res.status(201).json(savedMatch);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/scores', async (req, res) => {
    try {
        const { match, team, score, overs, wickets } = req.body;
        const newScore = new Score({ match, team, score, overs, wickets });
        const savedScore = await newScore.save();

        // Calculate run rate and update the Match model
        const runRate = calculateRunRate({ score, overs });
        await Match.findByIdAndUpdate(match, { $push: { scores: { team, score, overs, runRate, wickets } } });

        // Determine the winner based on the scores
        const matchDetails = await Match.findById(match).populate('teams');
        const winner = determineWinner(matchDetails.scores);

        // Update the winner field and match status in the Match model
        const matchStatus = determineMatchStatus(matchDetails.date);
        await Match.findByIdAndUpdate(match, { winner, matchStatus });

        res.status(201).json(savedScore);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/scores', async (req, res) => {
    try {
        const { match, team, score } = req.body;
        const newScore = new Score({ match, team, score });
        const savedScore = await newScore.save();
        res.status(201).json(savedScore);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/matches/:matchId/winner', async (req, res) => {
    try {
        const { matchId } = req.params;
        const match = await Match.findById(matchId).populate('winner');
        res.json({ winner: match.winner });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/matches/:matchId/runrate/:teamId', async (req, res) => {
    try {
        const { matchId, teamId } = req.params;
        const match = await Match.findById(matchId);
        const teamScore = match.scores.find(score => score.team.toString() === teamId);
        const runRate = calculateRunRate(teamScore);

        res.json({ runRate });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/matches/:matchId/status', async (req, res) => {
    try {
        const { matchId } = req.params;
        const match = await Match.findById(matchId);
        res.json({ matchStatus: match.matchStatus });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.put('/players/:playerId/score/:matchId', async (req, res) => {
    try {
        const { playerId, matchId } = req.params;
        const { newScore } = req.body;

        // Find the player and the match
        const player = await Player.findById(playerId);
        const match = await Match.findById(matchId);

        if (!player || !match) {
            return res.status(404).json({ error: 'Player or match not found' });
        }

        // Update the player's score for the match
        const existingScore = player.scores.find(score => score.match.toString() === matchId);
        if (existingScore) {
            // If the player has an existing score for the match, update it
            existingScore.score = newScore;
        } else {
            // If the player doesn't have a score for the match, create a new one
            player.scores.push({ match: matchId, score: newScore });
        }

        // Save the updated player
        await player.save();

        res.json({ success: true, message: 'Player score updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
