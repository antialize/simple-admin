-- sql-product: sqlite

CREATE TABLE IF NOT EXISTS `objects` (
    `id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `type` INTEGER NOT NULL, 
    `name` TEXT NOT NULL,
    `content` TEXT NOT NULL,
    `comment` TEXT NOT NULL,
    `time` INTEGER NOT NULL,
    `newest` BOOLEAN NOT NULL,
    `category` INTEGER,
    `author` INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS `id_version` ON `objects` (id, version);
      
CREATE TABLE IF NOT EXISTS `messages` (
    `id` INTEGER NOT NULL PRIMARY KEY,
    `host` INTEGER,
    `type` TEXT,
    `subtype` TEXT,
    `message` TEXT,
    `url` TEXT,
    `time` INTEGER,
    `dismissed` BOOLEAN NOT NULL,
    `dismissedTime` INTEGER
);

CREATE INDEX IF NOT EXISTS `messagesIdx` ON `messages` (dismissed, time);
CREATE INDEX IF NOT EXISTS `messagesIdx2` ON `messages` (dismissed, dismissedTime);

CREATE TABLE IF NOT EXISTS `deployments` (
    `id` INTEGER,
    `host` INTEGER NOT NULL,
    `name` TEXT,
    `content` TEXT NOT NULL,
    `time` INTEGER NOT NULL,
    `type` INTEGER NOT NULL,
    `title` TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `deployments_host_name` ON `deployments` (host, name);

CREATE TABLE IF NOT EXISTS `installedPackages` (
    `id` INTEGER,
    `host` INTEGER NOT NULL,
    `name` TEXT
);
      
CREATE TABLE IF NOT EXISTS `docker_images` (
    `id` INTEGER NOT NULL PRIMARY KEY,
    `project` TEXT NOT NULL,
    `tag` TEXT NOT NULL,
    `manifest` TEXT NOT NULL,
    `hash` TEXT NOT NULL,
    `user` INTEGER NOT NULL,
    `time` INTEGER NOT NULL,
    `pin` BOOLEAN,
    `labels` TEXT,
    `removed` INTEGER,
    `used` INTEGER);

      
CREATE TABLE IF NOT EXISTS `docker_deployments` (
    `id` INTEGER NOT NULL PRIMARY KEY,
    `project` TEXT NOT NULL,
    `container` TEXT NOT NULL,
    `host` INTEGER NOT NULL,
    `startTime` INTEGER NOT NULL,
    `endTime` INTEGER,
    `config` TEXT,
    `hash` TEXT NOT NULL,
    `user` INTEGER,
    `setup` TEXT,
    `postSetup` TEXT,
    `timeout` INTEGER DEFAULT 120,
    `softTakeover` INTEGER NOT NULL DEFAULT 0,
    `startMagic` TEXT,
    `stopTimeout` INTEGER NOT NULL DEFAULT 10,
    `usePodman` INTEGER NOT NULL DEFAULT 0,
    `userService` INTEGER NOT NULL DEFAULT 0,
    `deployUser` TEXT,
    `serviceFile` TEXT,
    `description` TEXT);

CREATE TABLE IF NOT EXISTS `docker_image_tag_pins` (
    `id` INTEGER NOT NULL PRIMARY KEY,
    `project` TEXT NOT NULL, 
    `tag` TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS `docker_image_tag_pins_u` ON `docker_image_tag_pins` (`project`, `tag`);

CREATE TABLE IF NOT EXISTS `kvp` (
    `key` TEXT NOT NULL PRIMARY KEY,
    `value` TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS `sessions` (
    `id` INTEGER NOT NULL PRIMARY KEY,
    `user` TEXT NOT NULL,
    `host` TEXT NOT NULL,
    `sid` TEXT NOT NULL,
    `pwd` INTEGER,
    `otp` INTEGER);

CREATE UNIQUE INDEX IF NOT EXISTS `sessions_sid` ON `sessions` (`sid`);