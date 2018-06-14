Please understand that this project has been open-sourced for a few reasons, none of which are to create more work for myself, from strangers with no appreciation for this fact. That said, I will be maintaining this for production use for some time so it will likely get good attention.

If you think something is broken, filing an issue ( [ISSUES on GitHub](https://github.com/rainabba/node-cloudfs-drive/issues) ) is your first step (even if you intend to solve it). Ideally, you'll next fork the project and fix it, then submit a PR. If you don't know how to do that yet, I recommend checking out [Github First Contributions](https://github.com/Roshanjossey/first-contributions).

Personally, I contribute on GitHub regularly without ever leaving the browser when I can fork/edit/submit-pr with just a couple clicks inside a project on GitHub. For more involved work, I fork on GitHub, then use SmartGit to clone to my PC and then I enable GitFlow and use that to add a feature or hot-fix (depending on criticality), check THAT projects contributing guidelines (some can be so much effort that I conclude they don't want my contributions and I just use/maintain my own fork from there.) I hope you don't find this to be one of those projects, BUT you must run tests and they MUST pass.

##TESTS
Run `npm test` or `npm run test:dev` if you need debugging, and make sure ALL tests pass before you submit a PR. I should see test/CODE_COVERAGE.html as part of your PR as a result and that will let me also see the test results before deciding to take a PR.

## TODO
..* More tests to confirm exceptions as well as functionality
..* permissions.remove
..* More providers