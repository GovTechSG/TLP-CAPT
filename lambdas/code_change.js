// This lambda function will be called by the Bamboo whenever there are code change to the CAPT monitored branch.
// It expects the web request to provide the `proj_code` query parameter.

// Expected environment variables:
// JIRA_TOKEN=<Jira access token>
// BITBUCKET_TOKEN=<Bitbucket access token>

const axios = require('axios').default;
const db = require("db_config.js");

// This variable controls the duration of the pentest cycle. Code changes after the duration will create a new cycle (Jira Epic)
// and rollover existing opened Jira issues.
const PENTEST_CYCLE_DAYS = 14;

const jira_auth_header = {
  headers: {
    Authorization: "Bearer " + process.env.JIRA_TOKEN
  }
};

const bitbucket_auth_header = {
  headers: {
    Authorization: "Bearer " + process.env.BITBUCKET_TOKEN
  }
};

exports.handler = async (event) => {
  console.log("Event:", event)
  const proj_code = event.queryStringParameters.proj_code;
  if (!proj_code) {
    console.log('proj_code missing!');
    return 'proj_code missing!';
  }

  const project = await db("projects").where({code: proj_code}).first();
  if (!project) {
    console.log('Project cannot be found!');
    return 'Project cannot be found!';
  }

  const repos = await db("repos").where({project_id: project.id});
  const epics = await db("epics").where({project_id: project.id}).orderBy("created_at", "desc");
  const head_commits = await getHeadCommitOfAllBranches(project.bitbucket_proj_key, repos);

  if (epics.length > 0) { // Existing Epics
    const epic = epics[0];
    console.log("Last epic:", epic);

    const status = await getEpicStatus(epic.jira_key);
    console.log("Last epic status:", status);

    const now = new Date();
    const daysSinceEpicStarted = epic.started_at === null ? 0 : daysBetweenDates(epic.started_at, now);
    console.log("Days since epic started:", daysSinceEpicStarted);

    if (hasCodeChanged(epic.commits, head_commits) == false) {
      console.log("Current head commits", head_commits);
      console.log("No change detected, terminating...");
      return "No change detected";
    }

    if (status == "Closed" || status == "Closed Rollover") { // Existing epic is closed
      console.log("Last epic is closed, creating new epic");
      const epic_key = await createEpic(`Pentest Cycle ${(epics.length + 1)}`, project.jira_proj_key);

      const new_epic = {
        project_id: project.id,
        jira_key: epic_key,
        commits: JSON.stringify(head_commits)
      };
      await db("epics").insert(new_epic);

      const diffComment = generateDiffComment(project.bitbucket_proj_key, repos, epic.commits, head_commits);
      await commentOnIssue(new_epic.jira_key, diffComment);

      console.log("Created epic:", new_epic);
    }
    else if (epic.started_at !== null && daysSinceEpicStarted > PENTEST_CYCLE_DAYS) { // Existing started epic > pentest cycle length
      console.log("Last started epic is more than pentest cycle length, closing last epic and creating new epic...");

      // 1. Create new epic
      const epic_key = await createEpic(`Pentest Cycle ${(epics.length + 1)}`, project.jira_proj_key);
      await transitionIssue(epic_key, 'Started Review');
    
      const new_epic = {
        project_id: project.id,
        jira_key: epic_key,
        commits: JSON.stringify(head_commits),
        started_at: now
      };
      await db("epics").insert(new_epic);
      console.log("Created epic:", new_epic);

      await commentOnIssue(epic.jira_key, `Rolled over to ${new_epic.jira_key}.`);
      await commentOnIssue(new_epic.jira_key, `Rolled over from ${epic.jira_key}.`);

      const diffComment = generateDiffComment(project.bitbucket_proj_key, repos, epic.commits, head_commits);
      await commentOnIssue(new_epic.jira_key, diffComment);
  
      // 2. Copy over issues
      const openIssues = await getOpenIssuesInEpic(epic.jira_key);
      console.log("Existing open issues:", openIssues);

      await Promise.all(openIssues.map(async issue => {
        const new_issue_key = await createIssue(issue.summary, new_epic.jira_key, project.jira_proj_key);
        console.log("Create issue:", new_issue_key);

        if (issue.status.name == "Open") {
          console.log("No change in status");
        }
        else {
          await transitionIssue(new_issue_key, issue.status.name);
        }

        await commentOnIssue(issue.key, `Rolled over to ${new_issue_key}.`);
        await commentOnIssue(new_issue_key, `Rolled over from ${issue.key}.`);

        await commentOnIssue(new_issue_key, diffComment);
      }));

      // 3. Close old epic and issues
      await Promise.all(openIssues.map(async issue => {
        await transitionIssue(issue.key, 'Closed');
        console.log("Closed issue:", issue.key);
      }));

      await transitionIssue(epic.jira_key, 'Closed Rollover');
      console.log("Closed epic:", epic.jira_key);

    }
    else { // Existing opened epic
      console.log("Last epic is still opened");

      const diffComment = generateDiffComment(project.bitbucket_proj_key, repos, epic.commits, head_commits);
      // comment on epic
      await commentOnIssue(epic.jira_key, diffComment);

      // comment on open issues
      const openIssues = await getOpenIssuesInEpic(epic.jira_key);
      console.log("Existing open issues:", openIssues);

      await Promise.all(openIssues.map(async issue => {
        await commentOnIssue(issue.key, diffComment);
      }));

      // update epic in db
      const update_epic = {
        commits: JSON.stringify(head_commits)
      };
      await db("epics").where({id: epic.id}).update(update_epic);

      console.log("Updated epic", update_epic);
    }
  }
  else { // No Epic exist
    console.log("Epic does not exist, creating...");
    const epic_key = await createEpic("Pentest Cycle 1", project.jira_proj_key);
    
    const new_epic = {
      project_id: project.id,
      jira_key: epic_key,
      commits: JSON.stringify(head_commits)
    };
    await db("epics").insert(new_epic);

    await commentOnIssue(new_epic.jira_key, generateFirstPTCycleComment(project.bitbucket_proj_key, repos, head_commits));

    console.log("Created epic:", new_epic);
  }
  
  return "CAPT: received code change notification for " + proj_code + ".";
};

async function getHeadCommitOfAllBranches(proj_key, repos) {
  return await Promise.all(repos.map(async repo => {
    const res = await axios.get(`https://bitbucket.ship.gov.sg/rest/api/1.0/projects/${proj_key}/repos/${repo.name}/commits/${repo.branch}`, bitbucket_auth_header);
    
    return {
      repo_id: repo.id,
      commit: res.data.id
    };
  }));
}

async function createEpic(name, jira_proj_key) {
  const issue = {
    "fields": {
       "project":
       {
          "key": jira_proj_key
       },
       "customfield_10004": name, //epic name field
       "summary": name,
       "issuetype": {
          "name": "Epic"
       }
   }
  }

  const res = await axios.post("https://jira.ship.gov.sg/rest/api/2/issue/", issue, jira_auth_header);

  return res.data.key;
}

async function createIssue(name, linked_epic_key, jira_proj_key) {
  const issue = {
    "fields": {
       "project":
       {
          "key": jira_proj_key
       },
       "summary": name,
       "issuetype": {
          "name": "Task"
       },
       "customfield_10001": linked_epic_key // epic link field
   }
  }

  const res = await axios.post("https://jira.ship.gov.sg/rest/api/2/issue/", issue, jira_auth_header);

  return res.data.key;
}

async function getEpicStatus(epic_key) {
  const res = await axios.get(`https://jira.ship.gov.sg/rest/api/2/issue/${epic_key}?fields=status`, jira_auth_header);

  return res.data.fields.status.name;
}

async function getOpenIssuesInEpic(epic_key) {
  const res = await axios.post("https://jira.ship.gov.sg/rest/api/2/search", {
    "jql": `"Epic Link" = ${epic_key}`,
    "fields": [
      "status",
      "summary"
    ]
  },
  jira_auth_header);

  const issues = res.data.issues.filter(issue => {
    const status = issue.fields.status.name;
    return status !== "Closed" && status !== "Acceptance";
  }).map(issue => {
    {
      return {
        key: issue.key,
        link: issue.self,
        status: issue.fields.status,
        summary: issue.fields.summary
      };
    }
  })

  return issues;
}

async function commentOnIssue(issue_key, comment) {
  await axios.post(`https://jira.ship.gov.sg/rest/api/2/issue/${issue_key}/comment`, {
    "body": comment
  }, jira_auth_header);
}

async function transitionIssue(key, toState) {
  let transitions = await axios.get(`https://jira.ship.gov.sg/rest/api/2/issue/${key}/transitions?expand=transitions.fields`, jira_auth_header);//.data.transitions;
  transitions = transitions.data.transitions;

  const transition = transitions.find(t => t.to.name === toState);
  console.log("Transiting issue:", key, "using transition:", toState);

  await axios.post(`https://jira.ship.gov.sg/rest/api/2/issue/${key}/transitions?expand=transitions.fields`, {
    "transition": {
      "id": `${transition.id}`
    }
  },
  jira_auth_header);
}

function hasCodeChanged(ori_end_commits, new_end_commits) {
  const new_hash = commits_by_repo_id(new_end_commits);

  for(let i = 0; i < ori_end_commits.length; i++) {
    const commit = ori_end_commits[i];
    if (new_hash[commit.repo_id] != commit.commit) return true;
  }

  return false;
}

function generateDiffComment(proj_key, repos, start_commits, end_commits) {
  const start_commit_hash = commits_by_repo_id(start_commits);
  const end_commit_hash = commits_by_repo_id(end_commits);

  const comment = "Code changes:\n\n" + (repos.map(repo => {
    if (start_commit_hash[repo.id] !== end_commit_hash[repo.id])
      return repo.name + ": " + diffCommitsLink(proj_key, repo.name, start_commit_hash[repo.id], end_commit_hash[repo.id])
  }).join("\n\n"));

  return comment;
}

function generateFirstPTCycleComment(proj_key, repos, start_commits) {
  const start_commit_hash = commits_by_repo_id(start_commits);

  const comment = "Code changes:\n\n" + (repos.map(repo => {
    return repo.name + ": " + browseAtCommitLink(proj_key, repo.name, start_commit_hash[repo.id]);
  }).join("\n\n"));

  return comment;
}

function diffCommitsLink(proj_key, repo, start_commit, end_commit) {
  return `https://bitbucket.ship.gov.sg/projects/${proj_key}/repos/${repo}/compare/diff?targetBranch=${start_commit}&sourceBranch=${end_commit}`
}

function browseAtCommitLink(proj_key, repo, commit) {
  return `https://bitbucket.ship.gov.sg/projects/${proj_key}/repos/${repo}/browse?at=${commit}`;
}

function commits_by_repo_id(commits) {
  return commits.reduce((h, sc) => {h[sc.repo_id] = sc.commit; return h}, {});
}

function daysBetweenDates(start, end) {
  const difference = end.getTime() - start.getTime();
  return Math.ceil(difference / (1000 * 3600 * 24));
}
