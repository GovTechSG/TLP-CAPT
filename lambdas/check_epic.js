// This lambda function should be called by a daily cron job

// Expected environment variables:
// JIRA_TOKEN=<Jira access token>

const axios = require('axios').default;
const db = require("db/db_config.js");

// Set this variable to control how many days since no code change before moving Epic state from OPEN to STARTED REVIEW
const EPIC_START_BUFFER_DAYS = 2;

const jira_auth_header = {
  headers: {
    Authorization: "Bearer " + process.env.JIRA_TOKEN
  }
};

exports.handler = async (event) => {
  const today = new Date();
  const cutoff_date = new Date();
  cutoff_date.setDate(today.getDate() - EPIC_START_BUFFER_DAYS); // X days of no more activity
  console.log("cut-off date", cutoff_date);

  const epics = await db("epics"); // todo: this can be optimised to only return the latest epic per project instead of pulling everything
  
  const latestEpicPerProject = Object.values(epics.reduce((h, epic) => {
    if (epic.started_at !== null || epic.updated_at >= cutoff_date) {
      return h;
    }
    
    if (h[epic.project_id] === undefined || h[epic.project_id].created_at < epic.created_at) { // get latest epic for each project
      h[epic.project_id] = epic;
    }

    return h;
  }, {}));

  console.log("Latest unstarted epic per project", latestEpicPerProject);

  for (let i=0; i<latestEpicPerProject.length; i++) {
    const epic = latestEpicPerProject[i];

    await transitionIssue(epic.jira_key, 'Started Review');

    const update_epic = {
      started_at: today
    };
    await db("epics").where({id: epic.id}).update(update_epic);

    // todo: send us an email?
  }

  return "ok";
};

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
