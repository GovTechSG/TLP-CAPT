
exports.seed = async function(knex) {
  await knex('projects').del();
  await knex('repos').del();
  await knex('epics').del();

  project_ids = await knex('projects').returning('id').insert([
    {
      code: 'TLP',
      name: 'Technical Leadership Programme',
      jira_proj_key: 'GOVDEC',
      bitbucket_proj_key: 'DECADSOTJZ'
    },
    {
      code: 'TEST',
      name: 'Test Project',
      jira_proj_key: '',
      bitbucket_proj_key: ''
    }
  ]);

  await knex('repos').insert([
    {
      project_id: project_ids[0],
      name: 'capt-tenant1-code1',
      branch: 'master'
    },
    {
      project_id: project_ids[0],
      name: 'capt-tenant1-code2',
      branch: 'master'
    },
    {
      project_id: project_ids[0],
      name: 'tlp',
      branch: 'test-commit-resolver'
    },
    {
      project_id: project_ids[1],
      name: 'Test Backend',
      branch: 'master'
    },
  ]);
};
