"""Read committed Poetry inputs with the native library; never install a project.

Run with an isolated Python (-I) containing poetry==2.1.1. No Poetry CLI,
plugins, build backend, solver, repository access, or environment creation runs.
"""
import importlib.metadata
import json
import sys
import tomllib
from pathlib import Path

from poetry.core.factory import Factory
from poetry.packages.locker import Locker


def versions():
    result = {name: importlib.metadata.version(name) for name in ("poetry", "poetry-core", "packaging", "tomlkit")}
    if result["poetry"] != "2.1.1" or result["poetry-core"] != "2.1.1":
        raise ValueError("Poetry and poetry-core must both be 2.1.1")
    return {"python": sys.version.split()[0], **result}


def capture(directory, lock_name):
    directory = Path(directory)
    manifest = tomllib.loads((directory / "pyproject.toml").read_text())
    lock = tomllib.loads((directory / lock_name).read_text())
    if lock.get("metadata", {}).get("lock-version") != "2.1":
        raise ValueError("Only Poetry lock version 2.1 is supported")
    # Direct/local dependencies need independent source verification. Reject
    # before native constructors can inspect paths outside the captured project.
    def reject_direct(value):
        if isinstance(value, dict):
            if any(key in value for key in ("path", "git", "url")):
                raise ValueError("Direct/local Poetry dependencies require a separate collector")
            for child in value.values():
                reject_direct(child)
        elif isinstance(value, list):
            for child in value:
                reject_direct(child)
    poetry = manifest.get("tool", {}).get("poetry", {})
    for section in (poetry.get("dependencies", {}), poetry.get("dev-dependencies", {}), poetry.get("group", {})):
        reject_direct(section)
    # This first boundary deliberately handles the legacy Poetry manifest form.
    if manifest.get("project"):
        raise ValueError("PEP 621 Poetry manifests are not yet supported")
    for entry in lock.get("package", []):
        if entry.get("source", {}).get("type") not in (None, "legacy"):
            raise ValueError("Direct/local Poetry lock sources are not yet supported")
        reject_direct(entry.get("dependencies", {}))
    locker = Locker(directory / lock_name, manifest)
    if not locker.is_fresh():
        raise ValueError("Poetry lock content hash does not match pyproject.toml")
    root = Factory().create_poetry(directory).package
    repository = locker.locked_repository()
    packages = repository.packages
    metadata = lock["package"]
    if len(packages) != len(metadata):
        raise ValueError("Native Poetry reader collapsed distinct lock entries")
    # Match native packages back to their exact lock records, including source.
    by_native = []
    for entry in metadata:
        matches = [p for p in packages if p == locker._get_locked_package(entry, with_dependencies=False)]
        if len(matches) != 1:
            raise ValueError("Ambiguous native Poetry package identity")
        by_native.append(matches[0])

    def dependencies(package, owner_group=None):
        result = []
        for dep in (package.all_requires if owner_group is None else package.requires):
            groups = sorted(dep.groups) if owner_group is None else [owner_group]
            for group in groups:
                targets = [f"{i}:{group}" for i, candidate in enumerate(by_native)
                           if group in metadata[i]["groups"] and candidate.satisfies(dep)]
                condition = {
                    "marker": str(dep.marker), "python": dep.python_versions,
                    "extras": sorted(dep.extras), "inExtras": sorted(dep.in_extras),
                }
                result.append({"name": dep.name, "constraint": dep.pretty_constraint,
                               "targets": targets, "groups": [group],
                               "optional": dep.is_optional(), "condition": condition})
        return result

    return {"formatVersion": 1, "toolchain": versions(), "lock": lock, "manifest": manifest,
            "root": {"name": root.name, "version": str(root.version), "dependencies": dependencies(root)},
            "packages": [{"id": f"{i}:{group}", "lockIndex": i, "group": group,
                          "name": p.name, "version": str(p.version),
                          "dependencies": dependencies(p, group)}
                         for i, p in enumerate(by_native) for group in sorted(metadata[i]["groups"])]}


if __name__ == "__main__":
    print(json.dumps(versions() if sys.argv[1:] == ["--probe"] else capture(*sys.argv[1:]), sort_keys=True))
