
exports.up = async function(knex) {
  return knex.schema.createTable('projects', function (table) {
    table.increments();
    table.text('code').notNullable();
    table.text('name').notNullable();
    table.text('jira_proj_key').notNullable();
    table.text('bitbucket_proj_key').notNullable();
    table.timestamps(true, true);

    table.unique('code');
  });
};

exports.down = async function(knex) {
  return knex.schema.dropTableIfExists("projects");
};
