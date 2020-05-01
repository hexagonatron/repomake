#!/usr/bin/env node

const fetch = require("node-fetch");
const inquirer = require("inquirer");
const fs = require("fs");
const express = require("express");
const opn = require("opn");
const path = require("path");
const crypto = require("crypto");

const configDir = path.join(process.argv[1], "..", "..", "config");
const savedTokens = path.join(configDir, "token.json");

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

            opn(`https://github.com/login/oauth/authorize?client_id=4f91be4bf76de7d2ee02&state=${statetoSend}&scope=repo,user`);

        });

        app.get("/auth", (req, res) => {

            //If sent state doesn't match received state token then abort
            if (statetoSend != req.query.state) {
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
                    if (gitHubJson.error) {
                        rej("Could not auth with GitHub\n" + gitHubJson.error);
                    } else {
                        resolve(gitHubJson.access_token);
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
    return new Promise((res, rej) => {
        fs.readFile(path.join(configDir, "token.json"), 'utf-8', (err, data) => {
            if (err) return res(null);

            res(JSON.parse(data));
        });
    })
}).then((tokenJson) => {

    tokenJson = tokenJson?tokenJson:[];
    //If there were tokens in local storage
    if (tokenJson.length) {

        let choicesArray = [{
            name: "Authenticate with different GitHub login.",
            value: false
        }];

        tokenJson.forEach(identity => {
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
        })
    } else {
        return getToken()
    }
})
    .then(token => {

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

    })
    .then(loginObj => {

        //if issue with token then remove from saved tokens and stop execution
        if (!loginObj.login) {
            fs.readFile(savedTokens, 'utf-8', (err, data) => {
                if (err) return

                let currentData = JSON.parse(data);

                let newData = JSON.stringify(currentData.filter((val) => val.token != loginObj.token));

                fs.writeFile(savedTokens, newData, 'utf-8', (err) => {
                    if (err) return
                });

            })

            throw new Error("Cannot retrive data from GitHub. Aborting");
        }

        //If test request was a success then confirm with user to create new repo

        return inquirer.prompt({
            name: "confirm",
            message: `\n\nName: ${repositoryToMake.name}\nDescription: ${repositoryToMake.description}\nLogin: ${loginObj.login}\n\nAre you sure you want to create the above repository?`,
            type: "confirm"
        }).then(ans => {
            if (!ans.confirm) {
                throw new Error("Aborted by user");
            }

            return loginObj;
        })
    })
    .then(loginObj => {

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
                throw new Error("Error creating repository, please try again");
            }

            console.log(`Repository has been created. Visit at ${json.html_url}\n\nTo connect to an existing repository run the command \n\ngit remote add origin ${json.ssh_url}\ngit push -u origin master\n\n`);


            return new Promise((res, rej) => {
                fs.readFile(savedTokens, 'utf-8', (err, data) => {
                    if(err) res();

                    if (JSON.parse(data).some((val) => val.token === loginObj.token)) {
                        res(true);
                    } else {
                        res(false);
                    }
                })
            })
                .then(isAlreadySaved => {
                    if (!isAlreadySaved) {
                        return inquirer.prompt({
                            message: "Would you like to save your token to local storage to use for next time (less secure)?",
                            type: "confirm",
                            name: "save"
                        }).then(ans => {
                            if (ans.save) {

                                fs.readFile(savedTokens, 'utf-8', (err, data) => {
                                    if (err) throw new Error("Couldn't read file.")

                                    let currentData = JSON.parse(data);
                                    currentData = currentData?currentData:[];
                                    currentData.push(loginObj);
                                    let newData = JSON.stringify(currentData);

                                    fs.writeFile(savedTokens, newData, 'utf-8', (err) => {
                                        if (err) throw new Error("Couldn't write to file");

                                        console.log("\nSucessfully wrote token to file.")
                                    });

                                })

                            }
                        })
                    }
                })

        })
    })
    .catch((err) => {
        console.log(err);
    });