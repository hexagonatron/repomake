const fetch = require("node-fetch");
const inquirer = require("inquirer");
const fs = require("fs");
const express = require("express");
const opn = require("opn");

const PORT = 50073;

const app = express();

const sendToProxy = (gitHubCode) => {
    return fetch(`http://localhost:50074/gettoken?code=${gitHubCode}`).then(response => {
        return response.json()
    });
}

const serverListener = app.listen(PORT, (err) => {
    if (err) return console.log(err);
    
    console.log(`Server running on port ${PORT}`);

    
    opn("https://github.com/login/oauth/authorize?client_id=4f91be4bf76de7d2ee02&state=random_letters&scope=repo");

});

app.get("/auth", (req, res) => {
    console.log(req.query);

    const gitHubCode = req.query.code;
    sendToProxy(gitHubCode).then(gitHubJson => {
        console.log(gitHubJson);
        serverListener.close();
    });

    res.send("<html><body>You are authed! window will close</body><script>setTimeout(() => window.close(),3000)</script></html>");
    
});
