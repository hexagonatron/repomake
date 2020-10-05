#!/usr/bin/env node

//Dependancies
const fetch = require("node-fetch");
const inquirer = require("inquirer");
const fs = require("fs");
const express = require("express");
const opn = require("opn");
const path = require("path");
const crypto = require("crypto");

//Command line args/options
const argv = require("yargs")
.option("t", {
    alias: "token",
    describe: "Supply your own github personal access token with the user and repo permissions",
    type: "string",
    requiresArg: true
})
.option("n", {
    alias: "name",
    describe: "Sets the name of the repo to create",
    type: "string",
    nargs: 1,
    requiresArg: true
})
.option("d", {
    alias: "delete",
    describe: "Deletes all saved tokens",
})
.option("q", {
    alias: "quick",
    describe: "Creates a repo without prompting for questions. Gets repository name from package.json file or folder name. Uses last saved auth token"
}).argv;

//Functions

const mainScript = async () => {
    const repoToMake = {};

    repoToMake.name = await getName();

    repoToMake.description = await getDescription();

    const authToken = await getAuthToken();

    //returns false if token doesn't work
    const tokenLogin = await testToken(authToken);

    if(tokenLogin){
        await makeRepo(authToken, tokenLogin, repoToMake);
    } else {
        removeFromSaved(authToken);
        throw "Couldn't "
    }

    await askToSaveToken(authToken, tokenLogin);
}

const getName = async () => {
    if(argv.name){
        return argv.name
    } else {
        let defaultName = await getPackageInfo("name");
        if(!defaultName){
            defaultName = getFolderName();
        }

        if(argv.quick){
            return defaultName;
        }

        return inquirer.prompt([
            {
                name: "repoNamePrompt",
                message: "What would you like to call your repository?",
                default: `${defaultName}`,
                validate: (ans) => { return true }//Validate Fn
            }
        ]).then(({repoNamePrompt}) => {
            return repoNamePrompt
        });
    }
}

//Reads package.json for a supplied key if it exists
const getPackageInfo = async (key) => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    return new Promise ((res, rej) => {
        fs.exists(packageJsonPath, (exists) => {
            if(exists){
                fs.readFile(packageJsonPath, "utf-8", (err, data) => {
                    if(err) res(false);
                    try{
                        const packageJson = JSON.parse(data);
                        res(packageJson[key]);
                    } catch (err) {
                        res(false)
                    }
                });
            } else {
                res(false)
            }
        })
    })
}

const getFolderName = () => process.cwd().split(path.sep).pop();

const getDescription = async () => {
    const defaultDesc = await getPackageInfo("description");
    if(argv.quick){
        return (defaultDesc && !(defaultDesc == "undefined") )? defaultDesc: "";
    }

    if(!defaultDesc || defaultDesc == "undefined"){
        return inquirer.prompt(
            {
                name: "description",
                message: "Please enter a description for your repository:"
            }
        ).then(({description}) => {
            return description;
        });
    } else {
        return defaultDesc;
    }
}

const getAuthToken = async () => {

    if(argv.t){
        return argv.t;
    }

    const savedTokens = await loadSavedData();

    if (savedTokens.length) {

        if(argv.quick){
            return savedTokens[0].token;
        }
    
        let choicesArray = [];
        
        savedTokens.forEach(identity => {
            choicesArray.push({
                name: identity.login,
                value: identity.token
            })
        });

        choicesArray.push({
            name: "Authenticate with different GitHub login.",
            value: false
        })

        const question = {
            type: "list",
            name: "token",
            message: "Found some login tokens in storage, which would you like to use?",
            choices: choicesArray
        }

        //Ask which token to use, create reop with chosen token or gen a new token
        return inquirer.prompt(question).then( async ans => {
            if (ans.token) {
                swapSavedOrder(ans.token, savedTokens);
                return ans.token
            } else {
                return await getNewToken()
            }
        });
    } else {
        return await getNewToken()
    }
}

const loadSavedData = async () => {
    const configDir = path.join(process.argv[1], "..", "..", "config");
    const savedTokensDir = path.join(configDir, "token.json");

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
        });
    });
}

const getNewToken = async () => {
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

const testToken = async (token) => {

    if(argv.quick){
        return true
    }

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
            return json.login
        } else {
            return false
        }
    });
}

const makeRepo = async (token, login, repo) => {
    
    if(argv.quick){
        return await sendRepoToGithub(token, repo);
    }

    return inquirer.prompt({
        name: "confirm",
        message: `\n\nName: ${repo.name}\nDescription: ${repo.description}\nLogin: ${login}\n\nAre you sure you want to create the above repository?`,
        type: "confirm"
    }).then(async ans => {
        if (!ans.confirm) {
            throw "Aborted by user";
        }
        
        return await sendRepoToGithub(token, repo);
    }).catch((err) => {
        console.log(err)
    });
}

const sendRepoToGithub = async (token, repo) => {
    const params = JSON.stringify({
        "name": repo.name,
        "description": repo.description
    });

    const url = `https://api.github.com/user/repos`;


    return fetch(url, {
        method: "POST",
        headers: {
            "Accept": "application/vnd.github.v3+json",
            "Authorization": `token ${token}`,
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
        return true
    }).catch(err => {
        throw err;
    });
}

const askToSaveToken = async (token, login) => {

    if(argv.quick) {
        return
    }

    const savedTokens = await loadSavedData();

    if (!savedTokens.some((val) => val.token === token)) {
    
        return inquirer.prompt({
            message: "Would you like to save your token to local storage to use for next time (less secure)?",
            type: "confirm",
            name: "save"
        }).then(async ans => {
            if (ans.save) {
                savedTokens.push(
                    {
                        login: login, 
                        token: token
                    });
                return await saveDataToFile(JSON.stringify(savedTokens));

            }
        });
    }
}

const swapSavedOrder = (token, savedTokens) => {
    savedTokens.forEach((identity, i) => {
        if(token === identity.token){
            if (i != 0){
                const temp = savedTokens[0];
                savedTokens[0] = savedTokens[i];
                savedTokens[i] = temp;
            }
        }
    });

    saveDataToFile(JSON.stringify(savedTokens));
}

const saveDataToFile = (data) => {
    return new Promise((res, rej) => {

        const configDir = path.join(process.argv[1], "..", "..", "config");
        const savedTokensDir = path.join(configDir, "token.json");
    
        fs.writeFile(savedTokensDir, data, "utf-8", (err) => {
            if (err){
                rej("Couldn't save data to file");
            }
            res(true);
        })
    })
}

const clearSavedTokens = async () => {
    await saveDataToFile("[]");
    console.log("Saved tokens have been deleted");
}


if(argv.d){
    clearSavedTokens();
} else {

    try{
        mainScript();
    } catch (err) {
        console.log(err);
    }

}
