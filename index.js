import { Octokit } from "@octokit/rest"
import { createTokenAuth } from "@octokit/auth-token"
import { giteaApi } from "gitea-js"

// 1 minute sleep between migrations
const sleepTimeMs = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

/**
  * This function migrates all github reops for a given user over to gitea as a mirror.
  *
  * @param {string} username 
  * @param {string} ghToken 
  * @param {string} gtURL 
  * @param {string} gtToken 
  *
  * @returns {Promise<undefined>}
  */
async function mirrorGithubUserReposInGitea(username, ghToken, gtURL, gtToken) {
  const ghClient = new Octokit({
    auth: ghToken
  });
  const gtClient = giteaApi(gtURL, {
    token: gtToken,
  });
  const githubRepos = [];
  await ghClient.paginate("GET /search/repositories", { q: `user:${username}`, per_page: 30 }, (response, done) => {
    numIters++;
    // console.dir(response);
    response.data.map((repo) => {
      numRepos++;
      // console.log(repo);
      githubRepos.push(repo);
    });
  });
  for (const ghRepo of githubRepos) {
    console.log("migrating repo", ghRepo.name);
    try {
      const gtRepoResponse = await gtClient.repos.repoGet(username, ghRepo.name);
      console.log("repo must exist, did not get error...", ghRepo.name, gtRepoResponse);
    } catch (err) {
      if (err.status === 404) {
        // Repo does not exist in Gitea, migrate it...
        const migrateResponse = await gtClient.repos.repoMigrate({
          service: "github",
          auth_token: ghToken,
          clone_addr: ghRepo.html_url,
          repo_name: ghRepo.name,
          description: ghRepo.description,
          issues: true,
          labels: true,
          lfs: false,
          pull_requests: true,
          releases: true,
          wiki: true,
          repo_owner: username,
          mirror: true,
          private: ghRepo.private,
        });
        if (!migrateResponse.ok) {
          console.log("failed to migrate github repo", ghRepo.http_url, migrateResponse);
          throw migrateResponse.error;
        }
        console.log("repo migrated, sleeping", ghRepo.name, migrateResponse);
        await sleep(sleepTimeMs);
      } else {
        console.log("gitea call to get repo failed", err);
        throw err;
      }
    }
  }
}

let numIters = 0;
let numRepos = 0;
async function run() {
  await mirrorGithubUserReposInGitea(process.env.GITHUB_USERNAME, process.env.GITHUB_TOKEN, process.env.GITEA_URL, process.env.GITEA_TOKEN);
  // const ghClient = new Octokit({
  //   auth: process.env.GITHUB_TOKEN
  // });
  // const gtClient = giteaApi(process.env.GITEA_URL, {
  //   token: process.env.GITEA_TOKEN,
  // });
  // const githubRepos = [];
  // await ghClient.paginate("GET /search/repositories", { q: `user:${process.env.GITHUB_USERNAME}`, per_page: 30 }, (response, done) => {
  //   numIters++;
  //   // console.dir(response);
  //   response.data.map((repo) => {
  //     numRepos++;
  //     // console.log(repo);
  //     githubRepos.push(repo);
  //   });
  // });
  // for (const ghRepo of githubRepos) {
  //   console.log("migrating repo", ghRepo.name);
  //   try {
  //     const gtRepoResponse = await gtClient.repos.repoGet(process.env.GITEA_USERNAME, ghRepo.name);
  //     console.log("repo must exist, did not get error...", ghRepo.name, gtRepoResponse);
  //   } catch (err) {
  //     if (err.status === 404) {
  //       // Repo does not exist in Gitea, migrate it...
  //       const migrateResponse = await gtClient.repos.repoMigrate({
  //         service: "github",
  //         auth_token: process.env.GITHUB_TOKEN,
  //         clone_addr: ghRepo.html_url,
  //         repo_name: ghRepo.name,
  //         description: ghRepo.description,
  //         issues: true,
  //         labels: true,
  //         pull_requests: true,
  //         releases: true,
  //         wiki: true,
  //         repo_owner: process.env.GITEA_USERNAME,
  //         mirror: true,
  //         private: ghRepo.private,
  //       });
  //       if (!migrateResponse.ok) {
  //         console.log("failed to migrate github repo", ghRepo.http_url, migrateResponse);
  //         throw migrateResponse.error;
  //       }
  //       console.log("repo migrated, sleeping", ghRepo.name, migrateResponse);
  //       await sleep(sleepTimeMs);
  //     } else {
  //       console.log("gitea call to get repo failed", err);
  //       throw err;
  //     }
  //   }
  //   // if (ghRepo.private) {
  //   //   console.log("found a private repo", ghRepo);
  //   //   break;
  //   // }
  // }
}

run().then(() => {
  console.log("done!", numIters, numRepos);
}).catch(err => {
  console.log("got an error", err);
});
