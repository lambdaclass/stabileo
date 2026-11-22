### Fixed
#### Web Unit shard 8 worker RPC timeouts

Design and export tests give Vitest time to process worker replies between design stages, and the resize tests yield between rounds. The unit setup reports long event-loop stalls with the file name. (#2439)
