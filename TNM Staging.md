# Converting TNM to a Staging Value

The current algorithm for determining the numeric staging algorithm is based on
the [TNM classification](https://www.ncbi.nlm.nih.gov/books/NBK553187/) and
works as follows:

1. If M is 1, staging is 4. Skip remaining steps.
2. If N is greater than 0, staging is 3. Skip remaining steps.
3. If T is greater than 2, staging is 2. Skip remaining steps.
4. If T is 1, staging is 1. Skip remaining steps.
5. If T is "is" (in situ), staging is 0. Skip remaining steps.
6. Otherwise, the value is T0 N0 M0 which is effectively "no cancer." This has no corresponding staging, so staging is `null`.

This breaks down as follows:

| T      | N          | M  | Staging |
|--------|------------|----|---------|
| T0     | N0         | M0 | `null`  |
| Tis    | N0         | M0 | 0       |
| T1, T2 | N0         | M0 | 1       |
| T3, T4 | N0         | M0 | 2       |
| (any)  | N1, N2, N3 | M0 | 3       |
| (any)  | (any)      | M1 | 4       |
