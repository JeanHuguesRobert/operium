"""Render, NEVER apply, fixed Caddy route replacing per-user browser entries.

The operator must independently validate and review the candidate, and perform
backed-up cutover only after real authenticated browser acceptance.
"""
import argparse
from pathlib import Path


def render(source):
    marker='    handle {\n        route {\n'
    if source.count(marker)!=1 or not source.rstrip().endswith('}\n}'):
        raise ValueError('unexpected Caddy vhost layout')
    prefix=source.split(marker,1)[0]
    original=source[len(prefix):]
    for invariant in ('basicauth {','reverse_proxy @fred 127.0.0.1:8445',
                      'reverse_proxy @maguy 127.0.0.1:8446',
                      'reverse_proxy 127.0.0.1:8444'):
        if invariant not in original:
            raise ValueError('missing existing routing invariant')
    return prefix+'''    handle {
        reverse_proxy 127.0.0.1:8768
    }
}
'''

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('current',help='existing Caddy site file')
    ap.add_argument('output',help='new candidate file (must not exist)')
    a=ap.parse_args()
    current=Path(a.current)
    output=Path(a.output)
    with output.open('x') as f:
        f.write(render(current.read_text()))
    print('Candidate generated; NOT installed')
