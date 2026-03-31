def find_column_fuzzy(df, target_name):
    """
    Finds a column in the DataFrame that matches target_name.

    Matching rules:
    - Ignore spaces
    - Ignore underscores
    - Ignore *
    - Ignore case

    Example matches:
        service Provider  -> serviceProvider
        cost Reference Gid -> costReferenceGid
        COST_REFERENCE_GID -> costReferenceGid
    """

    # Safety check
    if target_name is None:
        return None

    # Convert target name to normalized format
    search_term = (
        str(target_name)
        .replace("*", "")
        .replace("_", "")
        .replace(" ", "")
        .strip()
        .lower()
    )

    # Direct match first
    if target_name in df.columns:
        return target_name

    # Fuzzy match through columns
    for col in df.columns:
        normalized_col = (
            str(col)
            .replace("*", "")
            .replace("_", "")
            .replace(" ", "")
            .strip()
            .lower()
        )

        if normalized_col == search_term:
            return col

    return None