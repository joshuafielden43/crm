#!/usr/bin/env bash

set -euo pipefail

TYPES='feat|fix|perf|refactor|docs|revert|deps|chore|test|ci|build|style'

check() {
	local title=${1-} subject
	printf '%s' "$title" | grep -Eq "^($TYPES)(\([^)]+\))?!?: .+" || return 1
	subject=${title#*: }
	printf '%s' "$subject" | grep -Eq '^[A-Z][a-z]' && return 1
	case "$subject" in *.) return 1 ;; esac
	return 0
}

bump_of() {
	local title=${1-} head type
	head=${title%%:*}
	case "$head" in *'!') printf '3'; return ;; esac
	type=${head%%(*}
	case "$type" in
	feat) printf '2' ;;
	fix | perf | revert) printf '1' ;;
	*) printf '0' ;;
	esac
}

floor_of() {
	local base=$1 head=$2 subject best=0 bump
	if git log "$base..$head" --no-merges --format=%B | grep -q '^BREAKING[ -]CHANGE'; then
		printf '3'
		return
	fi
	while IFS= read -r subject; do
		bump=$(bump_of "$subject")
		[ "$bump" -gt "$best" ] && best=$bump
	done < <(git log "$base..$head" --no-merges --format=%s)
	printf '%s' "$best"
}

retype() {
	local title=$1 want=$2 head scope rest
	rest=${title#*: }
	head=${title%%:*}
	scope=''
	case "$head" in *'('*')'*) scope=$(printf '%s' "$head" | sed -e 's/^[^(]*(//' -e 's/).*$//') ;; esac

	case "$want" in
	3) head='feat!' ;;
	2) head='feat' ;;
	*) printf '%s' "$title"; return ;;
	esac

	if [ -n "$scope" ]; then
		case "$want" in
		3) printf 'feat(%s)!: %s' "$scope" "$rest" ;;
		*) printf 'feat(%s): %s' "$scope" "$rest" ;;
		esac
	else
		printf '%s: %s' "$head" "$rest"
	fi
}

sufficient() {
	local base=$1 head=$2 title=$3
	[ "$(bump_of "$title")" -ge "$(floor_of "$base" "$head")" ]
}

scope_for() {
	local files=$1 scopes
	scopes=$(printf '%s\n' "$files" | sed -n \
		-e 's#^apps/\([^/]*\)/.*#\1#p' \
		-e 's#^packages/\([^/]*\)/.*#\1#p' \
		-e 's#^docs/.*#docs#p' \
		-e 's#^\.github/.*#ci#p' |
		sort -u)
	if [ "$(printf '%s\n' "$scopes" | grep -c .)" = "1" ]; then
		printf '%s' "$scopes"
	fi
}

type_for() {
	local files=$1
	if ! grep -qvE '(^|/)(docs/|README|CONTRIBUTING|AGENTS|.*\.md$)' <<<"$files"; then
		printf 'docs'
	elif ! grep -qv '^\.github/' <<<"$files"; then
		printf 'ci'
	elif ! grep -qvE '(^|/)(test|tests|__tests__)/|\.spec\.|\.test\.' <<<"$files"; then
		printf 'test'
	elif ! grep -qvE '(^|/)(package\.json|bun\.lock|package-lock\.json)$' <<<"$files"; then
		printf 'chore'
	else
		printf 'feat'
	fi
}

subject_from_branch() {
	local subject
	subject=$(printf '%s' "${1-}" | sed -e 's#^[^/]*/##' -e 's/[-_]/ /g' -e 's/\.$//' -e 's/[[:space:]]*$//')
	printf '%s' "$subject" | grep -Eq '^[A-Z][a-z]' &&
		subject=$(printf '%s' "$subject" | sed -e 's/^\(.\)/\l\1/')
	printf '%s' "$subject"
}

generate() {
	local base=$1 head=$2 branch=${3-} floor
	floor=$(floor_of "$base" "$head")

	retype "$(propose "$base" "$head" "$branch")" "$floor"
	printf '\n'
}

propose() {
	local base=$1 head=$2 branch=${3-} files scope subject conventional title

	files=$(git diff --name-only "$base..$head")
	scope=$(scope_for "$files")

	conventional=$(
		while IFS= read -r subject; do
			if check "$subject"; then
				printf '%s' "$subject"
				break
			fi
		done < <(git log "$base..$head" --no-merges --reverse --format=%s)
	)
	if [ -n "$conventional" ]; then
		printf '%s\n' "$conventional"
		return 0
	fi

	subject=$(subject_from_branch "$branch")
	[ -n "$subject" ] || subject="update ${files%%$'\n'*}"
	if [ -n "$scope" ]; then
		printf '%s(%s): %s\n' "$(type_for "$files")" "$scope" "$subject"
	else
		printf '%s: %s\n' "$(type_for "$files")" "$subject"
	fi
}

case "${1-}" in
check) check "${2-}" ;;
generate) generate "${2:?base ref}" "${3:?head ref}" "${4-}" ;;
sufficient) sufficient "${2:?base ref}" "${3:?head ref}" "${4-}" ;;
*)
	echo "usage: pr-title.sh check <title> | pr-title.sh generate <base> <head> [branch] | pr-title.sh sufficient <base> <head> <title>" >&2
	exit 2
	;;
esac
