In the Services Page:

- a service/tool can have different version and they should be available all together, by default the latest version will be used, but user can select a specific version (via the configuration in yaml file)
- for each service tool, need to add 1 attribute to define type of UI: web, terminal, or both -> which then will define how the simulation of the UI of the service will look like in deployment step
- for the infrastructure, replace category -> sectors: health, insurance, etc... -> Check NIS2 for the list of critical sectors
- Change from Critical Infrastructure to Critical Infrastructure Services

In Project page:

- Add project -> List of Sector options need to be verified with the available critical infrastrcuture services (we cannot select a sector which does not have any criticial infrastructure service instance in the list)
  For the list of parner:
- The leader should be automatically selected
- The owner of critical infrasstructure services should automatically selected

Scenario editor

- show some guideline step by step in a helper button /popup modal
- switch the position in visual mode to select the target before the tool.
- Replace Execute -> Deploy
- add a button: Validate -> Validate the configuration, for now we validate by saying that the topology must have at least 1 target. The validation will need to be done before Deploying as well.
