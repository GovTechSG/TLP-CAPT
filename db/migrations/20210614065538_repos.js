
exports.up = async function(knex) {
  return knex.schema.createTable('repos', function (table) {
    table.increments();
    table.integer('project_id').unsigned();
    table.text('name').notNullable();
    table.text('branch').notNullable();
    table.timestamps(true, true);

    table.foreign('project_id').references('projects.id').onDelete('cascade');
  });
};

exports.down = async function(knex) {
  return knex.schema.dropTableIfExists("repos");
};
