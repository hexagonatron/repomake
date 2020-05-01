#!/usr/bin/env node

const fetch = require("node-fetch");
const inquirer = require("inquirer");
const fs = require("fs");
const express = require("express");
const opn = require("opn");
const path = require("path");
const crypto = require("crypto");

const configDir = path.join(process.argv[1],"..", "..", "config");
console.log(configDir);

console.log(process.argv);
console.log("__dirname: " + __dirname);
console.log("process.cwd()" + process.cwd());
console.log("__filename" + __filename);



let repositoryToMake = {};

repositoryToMake.name = process.argv[2] || false;

//Gets current folder name
const folder = process.cwd().split(path.sep).pop();


/* 
########## Function to spin up a server and get a token ##########
*/

const getToken = () => {
    return new Promise((resolve, rej) => {

        const PORT = 50073;

        const app = express();

        const statetoSend = crypto.randomBytes(16).toString("hex");

        const serverListener = app.listen(PORT, (err) => {
            if (err) return console.log(err);
        
            console.log(`Server running on port ${PORT}`);

        
            opn(`https://github.com/login/oauth/authorize?client_id=4f91be4bf76de7d2ee02&state=${statetoSend}&scope=repo`);
        
        });

        app.get("/auth", (req, res) => {
            console.log(req.query);

            //If sent state doesn't match received state token then abort
            if(statetoSend != req.query.state){
                res.send("<html>Problem with authentication<script>setTimeout(()=>window.close(), 2000)</script></html>");
                serverListener.close();
                return rej("Problem with authentication. Aborting.");
            }
        
            const gitHubCode = req.query.code;


            fetch(`http://localhost:50074/gettoken?code=${gitHubCode}`)
            .then(response => {
                return response.json()
            })
            .then(gitHubJson => {
                if(response.error){
                    rej("Could not auth with GitHub\n" + response.error);
                } else {
                    console.log(gitHubJson);
                    resolve(response.access_token);
                }
                serverListener.close();
            });
        
            res.send("<html><body>You are authed! window will close</body><script>setTimeout(() => window.close(),3000)</script></html>");
        
        });



    })
}

/* 
########## Main script flow ##########
*/

//Prompt for name if not provided as an arg
(() => {
    if (!repositoryToMake.name) {
        return inquirer.prompt([
            {
                name: "repoNamePrompt",
                message: "What would you like to call your repository?",
                default: `${folder}`,
                validate: (ans) => { return true }//Filter Fn
            }
        ]).then((ans) => {
            console.log(ans);
            repositoryToMake.name = ans.repoNamePrompt;
        });
    }
})().then(() => {
    //Prompt for repo desc
    return inquirer.prompt(
        {
            name: "description",
            message: "Please enter a description for your repository:"
        }
    )

}).then(({ description }) => {
    repositoryToMake.description = description;

    //Check for user token
    return new Promise((res,rej) => {
        fs.readFile(path.join(configDir, "token.json"), 'utf-8', (err, data) => {
            if(err) return res(null);

            res(JSON.parse(data));
        });
    })
}).then((tokenJson) => {

    //If there were tokens in local storage
    if(tokenJson){

        let choicesArray = [{
            name: "Authenticate with different GitHub login.",
            value: false
        }];

        tokenJson.forEach(identity => {
            choicesArray.unshift({
                name: identity.login,
                value: identity.token})
        });

        const question = {
            type: "list",
            name: "token",
            message: "Found some login tokens in storage, which would you like to use?",
            choices: choicesArray
        }
        
        //Ask which token to use, create reop with chosen token or gen a new token
        return inquirer.prompt(question).then(ans => {
            if(ans.token){
                // createRepository(ans.token)
                console.log(ans.token);
                return ans.token
            } else{
                return getToken()
            }
        })
    } else {
        
        console.log("GenToken");
            return getToken()
    }
})
.then(token => {
    console.log(token)

    //Test token to make sure it works
})
.catch((err) => {
    console.log(err);
});




/*
const sendToProxy = (gitHubCode) => {
    return fetch(`http://localhost:50074/gettoken?code=${gitHubCode}`).then(response => {
        return response.json()
    });
}

const serverListener = app.listen(PORT, (err) => {
    if (err) return console.log(err);

    console.log(`Server running on port ${PORT}`);
    serverListener.close();

    // opn("https://github.com/login/oauth/authorize?client_id=4f91be4bf76de7d2ee02&state=random_letters&scope=repo");

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


*/
