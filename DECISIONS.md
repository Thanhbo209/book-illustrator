<!-- DECISION 1 -->

## Uploaded-file detection in `parseCreateProjectForm`

**My decision:** Use `instanceof File` because the application expects an actual uploaded `File`, making the check explicit and type-safe.

**Claude's decision:** Replace `instanceof File` with a property-based check (`name`, `size`, and `text()`) to handle possible differences between `File` implementations across environments.

**Difference:** Claude prioritized cross-runtime compatibility, while my approach prioritizes checking for the actual `File` type expected by the application.

**Final decision:** Keep `instanceof File`. The cross-runtime concern is relevant for tests, but changing production code to accept arbitrary file-like objects is unnecessary unless the application actually needs to support those runtimes.
