#!/usr/bin/env node

//Dependancies

const fetch = require("node-fetch");
const inquirer = require("inquirer");
const fs = require("fs");
const express = require("express");
const opn = require("opn");
const path = require("path");
const crypto = require("crypto");

const argv = require("yargs")
.option("t", {
    alias: "token",
    describe: "Supply your own github personal access token with the user and repo permissions",
    type: "string"
})
.option("n", {
    alias: "name",
    describe: "Sets the name of the repo to create",
    type: "string",
    nargs: 1
})
.option("d", {
    alias: "delete",
    describe: "Deletes all saved tokens",
})
.option("q", {
    alias: "quick",
    describe: "Creates a repo without prompting for questions. Uses last saved auth token"
}).argv;

console.log(argv);

//Function Decs

const getToken = () => {
    return new Promise((resolve, rej) => {

        const PORT = 50073;

        const app = express();

        const stateString = crypto.randomBytes(16).toString("hex");

        const server = app.listen(PORT, (err) => {
            if (err) return console.log(err);

            opn(`https://github.com/login/oauth/authorize?client_id=4f91be4bf76de7d2ee02&state=${stateString}&scope=repo,user`);

        });

        app.get("/auth", (req, res) => {

            //If sent state doesn't match received state token then abort
            if (stateString != req.query.state) {
                res.send("<html>Problem with authentication<script>setTimeout(()=>window.close(), 2000)</script></html>");
                server.close();
                return rej("Problem with authentication. Aborting.");
            }

            const gitHubAuthCode = req.query.code;


            fetch(`https://repomake.herokuapp.com/gettoken?code=${gitHubAuthCode}`)
                .then(response => {
                    return response.json()
                })
                .then(gitHubJson => {
                    if (gitHubJson.error) {
                        rej("Could not auth with GitHub\n" + gitHubJson.error);
                    } else {
                        resolve(gitHubJson.access_token);
                    }
                    server.close();
                });

            res.send("<html><body>Successfully received auth code from GitHub. Please return to terminal. This window will close.</body><script>setTimeout(() => window.close(),2000)</script></html>");

        });
    })
}

const loadSavedData = () => {
    return new Promise((res, rej) => {
        fs.readFile(savedTokensDir, "utf-8", (err, data) => {
            if(err){
                res([]);
            }
            else{
                try{
                    res(JSON.parse(data));
                } catch(err) {
                    res([]);
                }
            }
        })
    })
}

const saveDataToFile = (data) => {
    fs.writeFile(savedTokensDir, data, "utf-8", (err) => {
        if (err){
            throw new Error("Couldn't save data to file");
        }
    })
}

const checkForName = () => {
repositoryToMake.name = argv.name? argv.name: false;
}

//Variable decs

const configDir = path.join(process.argv[1], "..", "..", "config");
const savedTokensDir = path.join(configDir, "token.json");

let repositoryToMake = {};

//Main script flow


//Prompt for name if not provided as an arg

( _ => {
    return new Promise((res, rej) => {
        //if user hasn't passed in a name then prompt for one
        if (!repositoryToMake.name){
            
            const currentFolderName = process.cwd().split(path.sep).pop();
        
            return inquirer.prompt([
                {
                    name: "repoNamePrompt",
                    message: "What would you like to call your repository?",
                    default: `${currentFolderName}`,
                    validate: (ans) => { return true }//Validate Fn
                }
            ]).then((ans) => {
                repositoryToMake.name = ans.repoNamePrompt;
                res();
            });
        } else {
            res();
        }
    });
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
    
}).then(() => {

    return loadSavedData().then(savedTokens => {
        if (savedTokens.length) {
    
            let choicesArray = [{
                name: "Authenticate with different GitHub login.",
                value: false
            }];
    
            savedTokens.forEach(identity => {
                choicesArray.unshift({
                    name: identity.login,
                    value: identity.token
                })
            });
    
            const question = {
                type: "list",
                name: "token",
                message: "Found some login tokens in storage, which would you like to use?",
                choices: choicesArray
            }
    
            //Ask which token to use, create reop with chosen token or gen a new token
            return inquirer.prompt(question).then(ans => {
                if (ans.token) {
                    // createRepository(ans.token)
                    return ans.token
                } else {
                    return getToken()
                }
            });
    
        } else {
    
            return getToken()
        }
    });
}).then(token => {

    //Test token by getting user info
    return fetch("https://api.github.com/user", {
        method: "GET",
        headers: {
            "Accept": "application/vnd.github.v3+json",
            "Authorization": `token ${token}`
        }
    }).then(res => {
        return res.json()
    }).then(json => {
        if (json.login) {
            return {
                "token": token,
                "login": json.login
            }
        } else {
            return { "token": token }
        }
    });

}).then(loginObj => {

    //if issue with token then remove from saved tokens and stop execution
    if (!loginObj.login) {
        let newData = JSON.stringify(savedTokens.filter((val) => val.token != loginObj.token));
        saveDataToFile(newData);
        throw "Cannot retrive data from GitHub. Aborting";
    }

    //If test request was a success then confirm with user to create new repo

    return inquirer.prompt({
        name: "confirm",
        message: `\n\nName: ${repositoryToMake.name}\nDescription: ${repositoryToMake.description}\nLogin: ${loginObj.login}\n\nAre you sure you want to create the above repository?`,
        type: "confirm"
    }).then(ans => {
        if (!ans.confirm) {
            throw "Aborted by user";
        }
        return loginObj;
    });

}).then(loginObj => {

    const params = JSON.stringify({
        "name": repositoryToMake.name,
        "description": repositoryToMake.description
    });

    const url = `https://api.github.com/user/repos`;


    fetch(url, {
        method: "POST",
        headers: {
            "Accept": "application/vnd.github.v3+json",
            "Authorization": `token ${loginObj.token}`,
            "Content-Type": 'application/json'
        },
        body: params

    }).then(res => {
        return res.json()
    }).then(json => {
        if (!json.id) {
            throw "Error creating repository, please try again";
        }

        console.log(`Repository has been created. Visit at ${json.html_url}\n\nTo connect to an existing repository run the command \n\ngit remote add origin ${json.ssh_url}\ngit push -u origin master\n`);

        loadSavedData().then(savedTokens => {
            if (!savedTokens.some((val) => val.token === loginObj.token)) {
    
                inquirer.prompt({
                    message: "Would you like to save your token to local storage to use for next time (less secure)?",
                    type: "confirm",
                    name: "save"
                }).then(ans => {
                    if (ans.save) {
                        savedTokens.push(loginObj);
                        saveDataToFile(JSON.stringify(savedTokens));
                    }
                });
            }
        })

    });

}).catch((err) => {
    console.log(err);
});