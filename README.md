<h1 align="center"> RepoMake </h1>

<p align="center"> <b>A CLI tool for initialising GitHub repositories</b> </p>

## Description

This tool improves your workflow by allowing you to initialise new repositories on GitHub without leaving the command line.

## Installation

Clone the repository:
````bash
git clone https://github.com/hexagonatron/repomake.git
````

Install globally as an npm package:
````bash
cd repomake
npm install -g .
````

## Usage

Making a new repository on GitHub is as simple as running the following command from the directory of your repo and answering the questions.
````bash
repomake
````

The script will prompt you for a name if one is not provided with the "-n" flag. It then prompts you to provide a description if it was not able to find one in a package.json file.

The script will then authenticate with github using OAuth and then create a new repository using the GitHub API.

For more control see the available options in the next section

## Options Summary
````
-t, --token TOKEN           Supply your own personal access token from github(must require 'user' and 'repo' permissions)
-n, --name NAME_OF_REPO     Sets the name of the repo to create
-q, --quick                 Creates repo without prompting for questions (uses last saved auth token)
-d, --delete                Deletes all saved tokens
-h, --help
````
## Examples

Make a new repository with the name "my-new-repository"
````bash
repomake -n my-new-repository
````

Clear all saved tokens from storage
````bash
repomake -d
````

Create a repository quickly:

Note: This option will not prompt for name, description, login or confirmation.

Name is set using this heirachy, "-n" parameter -> name parameter in package.json -> current folder name

If no description is found in package.json then repo is created without one.

Last sucessful login token is used.
````bash
repomake -q
````

If you would rather supply your own personal GitHub access token. Supplied tokens must have both 'user' and 'repo' permissions for script to work. 
````bash
repomake -t YOUR_TOKEN
```` 

## Future directions

- Write tests
- More descriptive error messages
- Automatically add remote to local .git configuration
- Undo option to delete last repo created
- Publish on npm?

## Contributing

If you'd like to contribute please feel free to add features and open a pull request.

## Author
[Hexagonatron](https://github.com/hexagonatron)
